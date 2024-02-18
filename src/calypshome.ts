import { DeviceType } from './platformAccessory';
type Logger = {
    info(message: string, ...parameters: any[]): void;
    warn(message: string, ...parameters: any[]): void;
    error(message: string, ...parameters: any[]): void;
    debug(message: string, ...parameters: any[]): void;
    log(level: string, message: string, ...parameters: any[]): void;
}

export class CalypsHome {
    url = 'https://ma.calypshome.com';
    private sessionId?: string;

    constructor(private auth: { username: string; password: string }, public readonly logger: Logger) {
        this.logger.info('CalypsHome init');
    }

    login() {
        if (this.sessionId) {
            return Promise.resolve(true);
        }

        this.logger.debug(`Session init ${this.auth.username}/${'*'.repeat(this.auth.password.length)}`);
        return fetch(`${this.url}/login`, {
            method: 'POST',
            redirect: 'manual',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                _login: this.auth.username,
                _password: this.auth.password,
                _submit: 'Sign in',
            }).toString(),
        }).then((response) => {
            this.sessionId = response.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1];
            if (!response.headers.get('location')) {
                throw new Error('Login failed');
            }
            this.logger.debug('Logged in', this.sessionId);
        });
    }

    async devices(): Promise<DeviceType[]> {
        return this.login().then(() =>
            fetch(`${this.url}/ajax`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    Cookie: `JSESSIONID=${this.sessionId}`,
                },
            })
                .then((x) => x.json())
                .then((data: ResType) =>
                    data[0]
                        .filter((entry) => entry.objects && entry.alias !== 'System')
                        .flatMap((g) => g.objects ?? [])
                        .map((g) => {
                            const kv = g.statuss.reduce((acc, s) => {
                                const m = s.statusname.match(/\/([^/]+)$/);
                                if (m) {
                                    acc[m[1]] = s.status;
                                }
                                return acc;
                            }, {} as DeviceType['kv']);
                            return {
                                id: g.id,
                                gw: g.gw,
                                kv,
                                name: kv['__user_name'],
                                manufacturer: kv['manufacturer_name'],
                            } as DeviceType;
                        })
                )
        );
    }

    async action(object: { id: number; gw: string }, action: 'STOP' | 'CLOSE' | 'OPEN' | 'LEVEL' | 'TILT', args?: string): Promise<boolean> {
        const sp = new URLSearchParams({
            gw: object.gw,
            id: object.id.toString(),
            action,
            args: args ?? '',
        });
        this.logger.debug('ACTION', sp);
        return this.login().then(() =>
            fetch(`${this.url}/ihm`, {
                method: 'POST',
                headers: {
                    Cookie: `JSESSIONID=${this.sessionId}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: sp.toString(),
            }).then((response) => {
                if (response.status === 401) {
                    this.logger.debug('Session expired');
                    this.sessionId = undefined;
                    return this.action(object, action, args);
                }
                this.logger.debug('ACTION result', response.status, response.statusText);
                return true;
            })
        );
    }
}
type ResType = [
    [
        {
            alias: string;
            isconnected: boolean;
            objects?: {
                id: number;
                gw: string;
                statuss: { statusname: string; status: string }[];
            }[];
        }
    ]
];

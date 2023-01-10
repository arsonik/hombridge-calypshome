import { DeviceType } from './platformAccessory';
import { Logger } from 'homebridge';

export class CalypsHome {
    url = 'https://ma.calypshome.com';
    private sessionId?: string;
    lastUpdate?: number;

    constructor(private auth: { username: string; password: string }, public readonly log: Logger) {
        this.log.info(`Calyps'Home init with ${auth.username}/${'*'.repeat(auth.password.length)}`);
    }

    login() {
        if (this.sessionId) {
            return Promise.resolve(true);
        }

        this.log.debug('Session init');
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
        })
            .then((response) => {
                this.sessionId = response.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1];
                if (!response.headers.get('location')) {
                    throw new Error('Login failed');
                }
                this.log.debug('Logged in', this.sessionId);
            })
            .catch((e) => {
                this.log.error('Login failed', e);
            });
    }

    async devices(): Promise<DeviceType[]> {
        return this.login()
            .then(() =>
                fetch(`${this.url}/ajax`, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        Cookie: `JSESSIONID=${this.sessionId}`,
                    },
                })
                    .then((x) => x.json())
                    .then((data: { objects?: { id: number; gw: string; name: string; statuss: { statusname: string; status: string }[] }; alias: string; isconnected: boolean }[][]) =>
                        data[0]
                            .map((x) => x.objects ?? [])
                            .flat()
                            .filter((x) => x.gw !== 'System')
                    )
                    .then((x) => {
                        this.lastUpdate = new Date().getTime();
                        return x.map((g) => {
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
                            };
                        });
                    })
            )
            .catch((e) => {
                this.log.error('Failed to get devices', e);
                return [];
            });
    }

    action(object: { id: number; gw: string }, action: 'STOP' | 'CLOSE' | 'OPEN' | 'LEVEL' | 'TILT', args?: string) {
        const sp = new URLSearchParams({
            gw: object.gw,
            id: object.id.toString(),
            action,
            args: args ?? '',
        });
        this.log.debug('ACTION', sp);
        return this.login()
            .then(() =>
                fetch(`${this.url}/ihm`, {
                    method: 'POST',
                    headers: {
                        Cookie: `JSESSIONID=${this.sessionId}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: sp.toString(),
                }).then((response) => {
                    if (response.status === 401) {
                        this.log.debug('Session expired');
                        this.sessionId = undefined;
                        return this.action(object, action, args);
                    }
                    this.log.debug('ACTION result', response.status, response.statusText);
                    return true;
                })
            )
            .catch((e) => {
                this.log.error('Failed to send action', e);
                return [];
            });
    }
}

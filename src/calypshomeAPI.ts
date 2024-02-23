import assert from 'node:assert';
import { Logging } from 'homebridge';

export type DeviceType = {
    id: number;
    gw: string;
    kv: {
        level: string;
        __user_name: string;
        alert_message: string;
        manufacturer_name: string;
        product_name: string;
        angle?: string;
        present: string;
        status: 'down' | 'up';
    };
    name: string;
    manufacturer: string;
};

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
        },
    ],
];

export class CalypshomeAPI {
    private url = 'https://ma.calypshome.com';
    private sessionId?: string;

    constructor(
        private auth: { username: string; password: string },
        public readonly logger: Logging
    ) {}

    async login(): Promise<string> {
        if (this.sessionId) {
            return this.sessionId;
        }

        this.logger.debug(`Session init ${this.auth.username}/${'*'.repeat(this.auth.password.length)}`);
        return this.apiCall(`${this.url}/login`, {
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
                assert(response.status === 302, new Error('Login failed'));
                return response.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1];
            })
            .then((sessionId) => {
                if (!sessionId) {
                    throw new Error('Login failed');
                }
                return (this.sessionId = sessionId);
            });
    }

    async devices(): Promise<DeviceType[]> {
        return this.login().then(() =>
            this.apiCall(`${this.url}/ajax`, {
                headers: {
                    Accept: 'application/json',
                },
            })
                .then(async (x) => x.json())
                .catch((e) => {
                    this.logger.error('devices() response failed at json()', e);
                    throw e;
                })
                .then((data: ResType) =>
                    data[0]
                        .filter((entry) => entry.objects && entry.alias !== 'System')
                        .flatMap((g) => g.objects ?? [])
                        .map((g) => {
                            const kv = g.statuss.reduce(
                                (acc, s) => {
                                    const m = s.statusname.match(/\/([^/]+)$/);
                                    if (m) {
                                        acc[m[1]] = s.status;
                                    }
                                    return acc;
                                },
                                {} as DeviceType['kv']
                            );
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
        return this.login().then(() =>
            this.apiCall(`${this.url}/ihm`, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: sp.toString(),
            }).then((response) => response.status === 200)
        );
    }

    private async apiCall(url: string, options: RequestInit): ReturnType<typeof fetch> {
        const ac = new AbortController();
        setTimeout(() => {
            ac.abort();
        }, 5 * 1000);
        const isLogin = url.includes('/login');

        const opts = {
            method: 'POST',
            ...options,
            signal: ac.signal,
            headers: {
                ...options.headers,
            },
        };
        if (!isLogin) {
            opts.headers['Cookie'] = `JSESSIONID=${this.sessionId}`;
        }

        this.logger.debug(`API call ${url}`, opts);
        return fetch(url, opts)
            .then(async (response) => {
                const responseheaders: Record<string, unknown>[] = [];
                response.headers.forEach((v, k) => responseheaders.push({ [k]: v }));
                this.logger.debug(`API call ${url} response`, {
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: responseheaders,
                    },
                });
                if (response.status === 401 && !isLogin) {
                    this.logger.debug('Session expired');
                    this.sessionId = undefined;
                    return this.login().then(() => this.apiCall(url, options));
                }
                return response;
            })
            .catch((e) => {
                this.logger.error(`API call ${url}`, e);
                throw e;
            });
    }
}

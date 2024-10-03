import { Logging } from 'homebridge';

export type DeviceType = {
    id: string;
    gw: string;
    kv: {
        level: string;
        __user_name: string;
        alert_message: string;
        manufacturer_name: string;
        product_name: string;
        angle?: string;
        present: string;
        status: 'down' | 'up' | 'middle';
    };
    name: string;
    manufacturer: string;
};

type ResType = {
    objects: {
        id: string;
        gw: string;
        status: {
            value: string;
            name: string;
            time: string;
        }[];
        categories: unknown;
        name: string;
        type: 'Rolling_Shutter' | {};
        img: string;
        eventId: string;
        connected: boolean;
        actions: string[];
    }[];
};

export class CalypshomeAPI {
    private url: string;

    constructor(
        config: { url: string },
        public readonly logger: Logging
    ) {
        this.url = config.url;
    }

    async devices(): Promise<DeviceType[]> {
        return this.apiCall(`${this.url}/m?a=getObjects`, {
            headers: {
                Accept: 'application/json',
            },
        })
            .then(async (x) => x.json())
            .catch((e) => {
                this.logger.error('devices() response failed at json()', e);
                throw e;
            })
            .then((data: ResType) => {
                const shutters = data.objects.filter((entry) => entry.type === 'Rolling_Shutter');
                return shutters.map((g) => {
                    const kv = g.status.reduce(
                        (acc, s) => {
                            acc[s.name] = s.value;
                            return acc;
                        },
                        {} as DeviceType['kv']
                    );
                    return {
                        id: g.id,
                        gw: g.gw,
                        kv,
                        name: g.name,
                        manufacturer: kv.manufacturer_name,
                    } as DeviceType;
                });
            });
    }

    async action(object: { id: string }, action: 'STOP' | 'CLOSE' | 'OPEN' | 'LEVEL' | 'TILT', args?: Record<string, string>): Promise<boolean> {
        const sp = new URLSearchParams({
            id: object.id,
            action,
            args: args ? JSON.stringify(args) : '',
        });
        return this.apiCall(`${this.url}/m?a=command`, {
            body: sp,
        }).then((response) => response.status === 200);
    }

    private async apiCall(url: string, options: RequestInit): Promise<Response> {
        const ac = new AbortController();
        setTimeout(() => {
            ac.abort();
        }, 5 * 1000);

        const opts = {
            method: 'POST',
            ...options,
            signal: ac.signal,
        };

        this.logger.debug(`API call ${url}`, opts);
        return fetch(url, opts)
            .then((response) => {
                const responseheaders: Record<string, unknown>[] = [];
                response.headers.forEach((v, k) => responseheaders.push({ [k]: v }));
                this.logger.debug(`API call ${url} response`, {
                    status: response.status,
                    headers: responseheaders,
                });
                return response;
            })
            .catch((e) => {
                this.logger.error(`API call ${url}`, e);
                throw e;
            });
    }
}

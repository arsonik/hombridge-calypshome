import { Logging } from 'homebridge';
import { request } from 'undici';
import Dispatcher from 'undici/types/dispatcher';
import ResponseData = Dispatcher.ResponseData;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export type DeviceType = {
    id: string;
    gw: string;
    kv: {
        level: number;
        __user_name: string;
        alert_message: string;
        manufacturer_name: string;
        product_name: string;
        angle?: number;
        present: string;
        status: 'down' | 'up' | 'middle';
    };
    actions: ('OPEN' | 'CLOSE' | 'STOP' | 'LEVEL' | 'TILT')[];
    name: string;
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
        actions: DeviceType['actions'];
    }[];
};

export class CalypshomeAPI {
    private url: string;
    private inMemoryDevices: Record<DeviceType['id'], DeviceType> = {};
    private timer: NodeJS.Timeout | null = null;
    private updateInterval = 5 * 60 * 1000;

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
            .then(async (x) => x.body.json() as Promise<ResType>)
            .then((data) =>
                data.objects
                    .filter((entry) => entry.type === 'Rolling_Shutter')
                    .map((g) => {
                        const kv = g.status.reduce(
                            (acc, s) => {
                                acc[s.name] = ['angle', 'level'].includes(s.name) ? Number(s.value) : s.value;
                                return acc;
                            },
                            {} as DeviceType['kv']
                        );
                        return {
                            id: g.id,
                            gw: g.gw,
                            kv,
                            name: g.name,
                            actions: g.actions,
                            all: g,
                        } as DeviceType;
                    })
            )
            .then((devices) => {
                this.inMemoryDevices = devices.reduce((acc, device) => {
                    acc[device.id] = device;
                    return acc;
                }, {});

                // eslint-disable-next-line no-unused-expressions
                this.timer && clearTimeout(this.timer);

                this.timer = setTimeout(() => {
                    this.devices().catch((e) => {
                        this.logger.error('Update error', e);
                    });
                }, this.updateInterval);
                return devices;
            });
    }

    async action(id: string, action: 'STOP' | 'CLOSE' | 'OPEN' | 'LEVEL' | 'TILT', args?: Record<string, string>): Promise<boolean> {
        return this.apiCall(`${this.url}/m?a=command`, {
            body: new URLSearchParams({
                id,
                action,
                args: args ? JSON.stringify(args) : '',
            }).toString(),
        })
            .then((response) => response.statusCode === 200)
            .catch((e: Error) => {
                this.logger.error('Error in action', { id, action, args, e });
                return false;
            });
    }

    private apiCall(url: string, options: NonNullable<Parameters<typeof request>[1]>): Promise<ResponseData> {
        const ac = new AbortController();
        options.method ??= 'POST';
        options.signal = ac.signal;

        this.logger.debug(`API call ${url}`, options);
        const timer = setTimeout(() => {
            ac.abort();
        }, 5 * 1000);
        return request(url, options)
            .then((response) => {
                clearTimeout(timer);
                this.logger.debug(`API call ${url} response`, {
                    status: response.statusCode,
                });
                return response;
            })
            .catch((e) => {
                this.logger.error(`API call ${url}`, e);
                throw e;
            });
    }

    device(id: string): DeviceType | undefined {
        return this.inMemoryDevices[id];
    }
}

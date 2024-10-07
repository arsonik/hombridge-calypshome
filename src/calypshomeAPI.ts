import { Logging } from 'homebridge';
import { EventEmitter } from 'events';
import { Agent, request } from 'undici';
import { z } from 'zod';
import { RollingShutter } from './rollingShutter';

export const getObjectsSchema = z.object({
    objects: z.array(
        z.object({
            room: z.object({
                id: z.number(),
                name: z.string(),
            }),
            id: z.string(),
            status: z.array(
                z.object({
                    value: z.string(),
                    name: z.string(),
                    time: z.string(),
                })
            ),
            categories: z.unknown(),
            name: z.string(),
            type: z.enum(['Rolling_Shutter', 'Composite', 'EZSP']),
            img: z.string(),
            gw: z.string(),
            eventId: z.string(),
            connected: z.boolean(),
            actions: z.array(z.enum(['OPEN', 'CLOSE', 'STOP', 'LEVEL', 'TILT', 'SCAN', 'JOIN'])),
        })
    ),
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface CalypshomeAPI {
    on(event: typeof CalypshomeAPI.DEVICE_UPDATE, listener: (device: RollingShutter, type: 'angle' | 'level' | 'status') => void): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CalypshomeAPI extends EventEmitter {
    private url: string;
    private wsUrl: string;
    private inMemoryDevices: Record<RollingShutter['id'], RollingShutter> = {};
    private declare ws: WebSocket;

    static DEVICE_UPDATE = 'device_update';

    constructor(
        config: { url: string },
        public readonly logger: Logging
    ) {
        super();
        this.url = config.url;
        this.wsUrl = `${config.url.replace('http', 'ws')}/ws`;
    }

    close() {
        this.ws?.close();
    }

    async devices(): Promise<RollingShutter[]> {
        return this.apiCall(`${this.url}/m?a=getObjects`, {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((x) => x.body.json())
            .then((data) =>
                getObjectsSchema
                    .parse(data)
                    .objects.filter((entry) => entry.type === 'Rolling_Shutter')
                    .map((g) => new RollingShutter(g))
            )
            .then((devices) => {
                this.inMemoryDevices = devices.reduce(
                    (acc, device) => {
                        acc[device.id] = device;
                        return acc;
                    },
                    {} as Record<RollingShutter['id'], RollingShutter>
                );
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

    private apiCall(url: string, options: NonNullable<Parameters<typeof request>[1]>) {
        const ac = new AbortController();
        options.method ??= 'POST';
        options.signal = ac.signal;
        options.dispatcher = new Agent({
            keepAliveTimeout: 10,
            keepAliveMaxTimeout: 10,
        });

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

    device(id: string): RollingShutter | undefined {
        return this.inMemoryDevices[id];
    }

    connectWebSocket() {
        this.logger.info('Connecting WebSocket');
        // const START_TIMESTAMP = Math.round(new Date().getTime() / 1000);
        this.ws = new WebSocket(this.wsUrl, 'lws-mirror-protocol');
        this.ws.onopen = (event) => {
            this.logger.info('WebSocket connected', event);
            this.ws.send('p1 1 _web / login');
        };
        this.ws.onclose = (event) => {
            this.logger.warn('WebSocket onclose() retrying in 30s', event);
            setTimeout(() => {
                this.connectWebSocket();
            }, 30000);
        };
        this.ws.onerror = (event) => {
            this.logger.error('WebSocket error', event);
        };
        this.ws.onmessage = (event) => {
            this.handleWebSocketMessage(event);
        };
    }

    private handleWebSocketMessage(event: MessageEvent) {
        const [, , src, dest, cmd, rest, b64, value] = event.data.split(' ');
        // decode base64
        const message = b64.startsWith('@') ? Buffer.from(b64.substring(1), 'base64').toString() : b64;
        const sysmatch = message.match(/^event\/system\/gateway\/dev-\d\/id-self\/(.*)/);

        if (message === 'event/ui/web/connect') {
            return;
        }
        if (sysmatch) {
            if (['uptime', 'cpu_idle', 'disk_free', 'memory_free', 'load_5', 'system_uptime'].includes(sysmatch[1]) || sysmatch[1].startsWith('gw_')) {
                return;
            }
            this.logger.info('WebSocket system message', event.data, { match: sysmatch[1], value });
            return;
        }
        const devmatch = message.match(/^event\/io\/ezsp\/dev-\d\/([^/]+)\/(level|angle|status)/);
        if (devmatch) {
            const [, device, type] = devmatch;
            const matchedDevice = Object.values(this.inMemoryDevices).find((d) => d.id.includes(device));
            if (matchedDevice) {
                this.update(matchedDevice, type, value);
                return;
            }
            this.logger.warn('WebSocket dev message', event.data, { device, type });

            return;
        }
        this.logger.warn('WebSocket unknown message', event.data, { src, dest, cmd, rest, message, value });
    }

    update(device: RollingShutter, key: 'angle' | 'level' | 'status', value: string) {
        if (key === 'angle') {
            device.angle = Number(value);
        } else if (key === 'level') {
            device.level = Number(value);
        }

        this.emit(CalypshomeAPI.DEVICE_UPDATE, device, key);
    }
}

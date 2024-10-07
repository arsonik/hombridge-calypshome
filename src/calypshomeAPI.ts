import { Logging } from 'homebridge';
import { EventEmitter } from 'events';
import { Agent, request } from 'undici';
import { RollingShutter } from './rollingShutter';
import WebSocket from 'ws';
import { getObjectsResponseSchema } from './api/getObjectsResponseSchema'; // can be replaced with native node later

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CalypshomeAPI extends EventEmitter {
    private inMemoryDevices: Record<RollingShutter['id'], RollingShutter> = {};
    private ws: WebSocket | undefined = undefined;

    static DEVICE_UPDATE = 'device_update';

    constructor(
        private config: { url: string },
        private readonly logger: Logging
    ) {
        super();
    }

    async devices(): Promise<RollingShutter[]> {
        return this.apiCall(`${this.config.url}/m?a=getObjects`, {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((x) => x.body.json())
            .then((data) =>
                getObjectsResponseSchema
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
        return this.apiCall(`${this.config.url}/m?a=command`, {
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
        const ws = new WebSocket(`${this.config.url.replace('http', 'ws')}/ws`, 'lws-mirror-protocol');
        this.ws = ws;
        ws.on('open', () => {
            this.logger.info('WebSocket connected');
            ws?.send('p1 1 _web / login');
        });
        ws.on('close', () => {
            this.logger.warn('WebSocket onclose() retrying in 30s');
            setTimeout(() => {
                this.connectWebSocket();
            }, 30000);
        });
        ws.on('error', (event) => {
            this.logger.error('WebSocket error', event);
        });
        ws.on('message', (event) => {
            this.handleWebSocketMessage((event as Buffer).toString('utf-8'));
        });
    }

    private handleWebSocketMessage(data: string) {
        const [, , src, dest, cmd, rest, b64, value] = data.split(' ');
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
            this.logger.info('WebSocket system message', data, { match: sysmatch[1], value });
            return;
        }
        const devmatch = message.match(/^event\/io\/ezsp\/dev-\d\/([^/]+)\/(level|angle|status)/);
        if (devmatch) {
            const [, device, type] = devmatch;
            const matchedDevice = Object.values(this.inMemoryDevices).find((d) => d.id.includes(device));
            if (matchedDevice && ['level', 'angle', 'status'].includes(type)) {
                this.update(matchedDevice, type as 'level' | 'angle' | 'status', value);
                return;
            }
            this.logger.warn('WebSocket dev message', data, { device, type });

            return;
        }
        this.logger.warn('WebSocket unknown message', data, { src, dest, cmd, rest, message, value });
    }

    update(device: RollingShutter, key: 'angle' | 'level' | 'status', value: string) {
        if (key === 'angle') {
            device.angle = Number(value);
        } else if (key === 'level') {
            device.level = Number(value);
        }

        this.emit(CalypshomeAPI.DEVICE_UPDATE, device, key);
    }

    close() {
        this.ws?.close();
    }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface CalypshomeAPI {
    on(event: typeof CalypshomeAPI.DEVICE_UPDATE, listener: (device: RollingShutter, type: 'angle' | 'level' | 'status') => void): this;
}

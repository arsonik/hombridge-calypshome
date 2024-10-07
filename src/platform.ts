import { API, APIEvent, Categories, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { CalypshomeAPI } from './calypshomeAPI';
import { RollingShutter } from './rollingShutter';

export class CalypshomePlatform implements DynamicPlatformPlugin {
    // this is used to track restored cached accessories
    protected readonly accessories: PlatformAccessory<RollingShutter>[] = [];
    private readonly calypshome: CalypshomeAPI;

    constructor(
        protected readonly log: Logging,
        readonly config: PlatformConfig,
        readonly api: API
    ) {
        this.log.info('Booting CalypsHome platform');

        this.calypshome = new CalypshomeAPI(config as unknown as { url: string }, log);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.api.on(APIEvent.DID_FINISH_LAUNCHING, this.discoverDevices.bind(this));
        this.api.on(APIEvent.SHUTDOWN, () => {
            this.calypshome.close();
        });
        this.calypshome.on(CalypshomeAPI.DEVICE_UPDATE, this.updateDevice.bind(this));
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory as PlatformAccessory<RollingShutter>);
    }

    private updateDevice(device: RollingShutter, type: unknown) {
        const accessory = this.accessories.find((acc) => acc.context.id === device.id)?.getService(this.api.hap.Service.WindowCovering);
        if (!accessory) {
            this.log.warn('Accessory not found', device.id);
            return;
        }

        switch (type) {
            case 'level':
                accessory.getCharacteristic(this.api.hap.Characteristic.CurrentPosition).updateValue(device.level!);
                break;
            case 'angle':
                accessory.getCharacteristic(this.api.hap.Characteristic.CurrentHorizontalTiltAngle).updateValue(device.angle!);
                break;
            case 'status':
                // accessory.getCharacteristic(this.api.hap.Characteristic.PositionState).updateValue(this.api.hap.Characteristic.PositionState.STOPPED);
                break;
            default:
                this.log.warn('Unknown type:', type);
        }
    }

    private async discoverDevices() {
        return this.calypshome
            .devices()
            .then((devices) => {
                if (!devices.length) {
                    return { add: [], update: [], remove: [] };
                }
                this.calypshome.connectWebSocket();
                const remove = this.accessories.filter((acc) => !devices.some((device) => this.api.hap.uuid.generate(device.id) === acc.UUID));

                this.log.info(
                    'Devices:',
                    devices.map((d) => d.id)
                );

                return devices.reduce(
                    (acc, device) => {
                        const uuid = this.api.hap.uuid.generate(device.id);

                        let accessory = this.accessories.find((obj) => obj.UUID === uuid);
                        if (accessory) {
                            acc.update.push(accessory);
                        } else {
                            accessory = new this.api.platformAccessory<RollingShutter>(device.name, uuid, Categories.WINDOW_COVERING);
                            acc.add.push(accessory);
                        }
                        accessory.context = device;
                        this.hookupAccessory(accessory);
                        return acc;
                    },
                    { add: [], update: [], remove } as Record<'add' | 'update' | 'remove', PlatformAccessory<RollingShutter>[]>
                );
            })
            .then(({ add, update, remove }) => {
                if (add.length) {
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, add);
                }
                if (update.length) {
                    this.api.updatePlatformAccessories(update);
                }
                if (remove.length) {
                    this.log.warn('Removing accessories', remove.map((a) => a.displayName).join(', '));
                    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, remove);
                }
            });
    }

    private hookupAccessory(accessory: PlatformAccessory<RollingShutter>) {
        const characteristics = this.api.hap.Characteristic;
        // https://developers.homebridge.io/#/service/WindowCovering
        const wcService = accessory.getService(this.api.hap.Service.WindowCovering) ?? accessory.addService(this.api.hap.Service.WindowCovering);
        const aiService = accessory.getService(this.api.hap.Service.AccessoryInformation) ?? accessory.addService(this.api.hap.Service.AccessoryInformation);
        const { id } = accessory.context;

        aiService
            .setCharacteristic(characteristics.Manufacturer, accessory.context.manufacturerName)
            .setCharacteristic(characteristics.Model, accessory.context.actions.includes('TILT') ? 'BSO' : 'Shutter')
            .setCharacteristic(characteristics.SerialNumber, accessory.context.serialNumber);

        wcService.setCharacteristic(characteristics.Name, accessory.context.name);

        wcService.getCharacteristic(characteristics.CurrentPosition).onGet(() => this.calypshome.device(id)?.level ?? 0);
        wcService.getCharacteristic(characteristics.PositionState).onGet(() => characteristics.PositionState.STOPPED);
        wcService
            .getCharacteristic(characteristics.TargetPosition)
            .onGet(() => this.calypshome.device(id)?.level ?? 0)
            .onSet((value) => {
                void this.calypshome.action(id, 'LEVEL', { level: (value as number).toString() });
            });

        // if accessory has tilt support
        if (accessory.context.actions.includes('TILT')) {
            wcService.getCharacteristic(characteristics.CurrentHorizontalTiltAngle).onGet(() => this.calypshome.device(id)?.angle ?? 0);
            wcService
                .getCharacteristic(characteristics.TargetHorizontalTiltAngle)
                .onGet(() => this.calypshome.device(id)?.angle ?? 0)
                .onSet((value) => {
                    void this.calypshome.action(id, 'TILT', { angle: (value as number).toString() });
                });
        }

        wcService.getCharacteristic(characteristics.HoldPosition).onSet(() => {
            void this.calypshome.action(id, 'STOP');
        });
    }
}

import { API, APIEvent, Categories, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CalypshomeAPI, DeviceType } from './calypshomeAPI';

export class CalypshomePlatform implements DynamicPlatformPlugin {
    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory<DeviceType>[] = [];
    public readonly calypshome: CalypshomeAPI;

    constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig,
        public readonly api: API
    ) {
        this.log.info('Booting CalypsHome platform');

        this.calypshome = new CalypshomeAPI(config as unknown as { url: string }, log);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.api.on(APIEvent.DID_FINISH_LAUNCHING, this.discoverDevices.bind(this));
    }

    configureAccessory(accessory: PlatformAccessory<DeviceType>) {
        this.accessories.push(accessory);
    }

    private async discoverDevices() {
        return this.calypshome
            .devices()
            .then((devices) => {
                if (!devices.length) {
                    return { add: [], update: [], remove: [] };
                }
                const remove = this.accessories.filter((acc) => !devices.some((device) => this.api.hap.uuid.generate(device.id) === acc.UUID));

                return devices.reduce(
                    (acc, device) => {
                        const uuid = this.api.hap.uuid.generate(device.id);

                        let accessory = this.accessories.find((obj) => obj.UUID === uuid);
                        if (accessory) {
                            acc.update.push(accessory);
                        } else {
                            accessory = new this.api.platformAccessory<DeviceType>(device.name, uuid, Categories.WINDOW_COVERING);
                            acc.add.push(accessory);
                        }
                        accessory.context = device;
                        this.hookupAccessory(accessory);
                        return acc;
                    },
                    { add: [], update: [], remove } as Record<'add' | 'update' | 'remove', PlatformAccessory<DeviceType>[]>
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

    private hookupAccessory(accessory: PlatformAccessory<DeviceType>) {
        const characteristics = this.api.hap.Characteristic;
        // https://developers.homebridge.io/#/service/WindowCovering
        const wcService = accessory.getService(this.api.hap.Service.WindowCovering) ?? accessory.addService(this.api.hap.Service.WindowCovering);
        const aiService = accessory.getService(this.api.hap.Service.AccessoryInformation) ?? accessory.addService(this.api.hap.Service.AccessoryInformation);
        const { id } = accessory.context;

        aiService
            .setCharacteristic(characteristics.Manufacturer, accessory.context.kv.manufacturer_name)
            .setCharacteristic(characteristics.Model, accessory.context.actions.includes('TILT') ? 'BSO' : 'Shutter')
            .setCharacteristic(characteristics.SerialNumber, accessory.context.gw);

        wcService.setCharacteristic(characteristics.Name, accessory.context.name);
        wcService.getCharacteristic(characteristics.CurrentPosition).onGet(() => this.calypshome.device(id)?.kv.level ?? 0);
        wcService.getCharacteristic(characteristics.PositionState).onGet(() => characteristics.PositionState.STOPPED);
        wcService
            .getCharacteristic(characteristics.TargetPosition)
            .onGet(() => this.calypshome.device(id)?.kv.level ?? 0)
            .onSet((value) => {
                void this.calypshome.action(id, 'LEVEL', { level: (value as number).toString() });
            });

        // if accessory has tilt support
        if (accessory.context.actions.includes('TILT')) {
            wcService.getCharacteristic(characteristics.CurrentHorizontalTiltAngle).onGet(() => this.calypshome.device(id)?.kv.angle ?? 0);
            wcService
                .getCharacteristic(characteristics.TargetHorizontalTiltAngle)
                .onGet(() => this.calypshome.device(id)?.kv.angle ?? 0)
                .onSet((value) => {
                    void this.calypshome.action(id, 'TILT', { angle: (value as number).toString() });
                });
        }

        wcService.getCharacteristic(characteristics.HoldPosition).onSet(() => {
            void this.calypshome.action(id, 'STOP');
        });
    }
}

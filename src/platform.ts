import { API, APIEvent, Categories, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
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
        this.log.debug('Booting CalypsHome platform', this.config.name);

        this.calypshome = new CalypshomeAPI(config as unknown as { username: string; password: string }, log);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.api.on(APIEvent.DID_FINISH_LAUNCHING, this.discoverDevices.bind(this));
    }

    configureAccessory(accessory: PlatformAccessory<DeviceType>) {
        this.accessories.push(accessory);
    }

    private async discoverDevices() {
        return this.calypshome
            .devices()
            .then((devices) =>
                devices.reduce(
                    (acc, device) => {
                        const uuid = this.api.hap.uuid.generate(device.id.toString());
                        let accessory = this.accessories.find((obj) => obj.UUID === uuid);
                        if (accessory) {
                            acc.update.push(accessory);
                        } else {
                            accessory = new this.api.platformAccessory<DeviceType>(device.name, uuid, Categories.WINDOW_COVERING);
                            acc.add.push(accessory);
                        }
                        accessory.context = device;
                        this.hookupAccessory({ accessory, characteristic: this.api.hap.Characteristic });
                        return acc;
                    },
                    { add: [], update: [] } as Record<'add' | 'update', PlatformAccessory<DeviceType>[]>
                )
            )
            .then(({ add, update }) => {
                if (add.length) {
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, add);
                }
                if (update.length) {
                    this.api.updatePlatformAccessories(update);
                }
            });
    }

    private hookupAccessory({ accessory: ac, characteristic: ch }: { accessory: PlatformAccessory<DeviceType>; characteristic: typeof Characteristic }) {
        // https://developers.homebridge.io/#/service/WindowCovering
        const wcService = ac.getService(this.api.hap.Service.WindowCovering) ?? ac.addService(this.api.hap.Service.WindowCovering);
        const aiService = ac.getService(this.api.hap.Service.AccessoryInformation) ?? ac.addService(this.api.hap.Service.AccessoryInformation);

        aiService.setCharacteristic(ch.Manufacturer, ac.context.manufacturer).setCharacteristic(ch.Model, ac.context.gw).setCharacteristic(ch.SerialNumber, ac.context.id.toString());

        wcService.setCharacteristic(ch.Name, ac.context.name);

        wcService.getCharacteristic(ch.CurrentPosition).onGet(() => Number(ac.context.kv.level));
        wcService.getCharacteristic(ch.PositionState).onGet(() => ch.PositionState.STOPPED);
        wcService
            .getCharacteristic(ch.TargetPosition)
            .onGet(() => Number(ac.context.kv.level))
            .onSet((value) => this.calypshome.action({ id: ac.context.id, gw: ac.context.gw }, 'LEVEL', `level=${value as number}`));

        // if accessory has tilt support
        if ('angle' in ac.context.kv) {
            wcService
                .getCharacteristic(ch.CurrentHorizontalTiltAngle)
                .onGet(() => Number(ac.context.kv.angle))
                .onSet((value) => this.calypshome.action({ id: ac.context.id, gw: ac.context.gw }, 'TILT', `angle=${value as number}`));
        }

        wcService.getCharacteristic(ch.HoldPosition).onSet(() => this.calypshome.action({ id: ac.context.id, gw: ac.context.gw }, 'STOP'));
    }
}

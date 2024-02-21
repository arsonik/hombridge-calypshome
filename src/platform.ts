import { API, Categories, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CalypshomeAccessory, DeviceType } from './platformAccessory';
import { CalypsHome } from './calypshome';
import assert from 'assert';

type CalypsHomeAccessory = PlatformAccessory<DeviceType>;

export class CalypshomePlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: CalypsHomeAccessory[] = [];
    public readonly calypshome: CalypsHome;

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.calypshome = new CalypsHome(this.config as any, log);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            void this.discoverDevices();
        });
    }

    configureAccessory(accessory: CalypsHomeAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    discoverDevices() {
        return this.calypshome.devices().then((devices) => {
            devices.forEach((device) => {
                const uuid = this.api.hap.uuid.generate(device.id.toString());

                let accessory = this.accessories.find((obj) => obj.UUID === uuid);
                const isNew = !accessory;

                if (isNew) {
                    this.log.info('Adding new accessory:', device.name);
                    accessory = new this.api.platformAccessory<DeviceType>(device.name, uuid, Categories.WINDOW_COVERING);
                }
                assert(accessory, new Error('Accessory not found'));
                accessory.context = device;
                if (!isNew) {
                    this.log.info('Restoring existing accessory from cache:', accessory.displayName);
                    this.api.updatePlatformAccessories([accessory]);
                } else {
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
                new CalypshomeAccessory(this, accessory);
            });
        });
    }
}

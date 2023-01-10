import { API, Categories, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CalypshomeAccessory, DeviceType } from './platformAccessory';
import { CalypsHome } from './calypshome';

export class CalypshomePlatform implements DynamicPlatformPlugin {
    public readonly Service = this.api.hap.Service;
    public readonly Characteristic = this.api.hap.Characteristic;

    public readonly accessories: PlatformAccessory[] = [];
    calypshome: CalypsHome;

    constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.calypshome = new CalypsHome(this.config as any, log);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            void this.discoverDevices();
            setInterval(() => void this.updateDevices(), 60 * 1000 * 10);
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    discoverDevices() {
        return this.calypshome.devices().then((devices) => {
            devices.forEach((device) => {
                const uuid = this.api.hap.uuid.generate(device.id.toString());
                const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid) as PlatformAccessory<DeviceType> | undefined;

                if (existingAccessory) {
                    // the accessory already exists
                    this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                    // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                    existingAccessory.context = device;
                    this.api.updatePlatformAccessories([existingAccessory]);

                    new CalypshomeAccessory(this, existingAccessory);

                    // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                    // remove platform accessories when no longer present
                    // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                    // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                } else {
                    this.log.info('Adding new accessory:', device.name);

                    const accessory = new this.api.platformAccessory<DeviceType>(device.name, uuid, Categories.WINDOW_COVERING);
                    accessory.context = device;
                    new CalypshomeAccessory(this, accessory);

                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
            });
        });
    }

    updateDevices() {
        return this.calypshome.devices().then((devices) => {
            devices.forEach((device) => {
                const uuid = this.api.hap.uuid.generate(device.id.toString());
                const accessory = this.accessories.find((a) => a.UUID === uuid);
                const service = accessory?.getService(this.Service.WindowCovering);
                if (accessory && service) {
                    if (device.kv.__user_name === 'Office') {
                        this.log.debug('updateDevices', device.kv.__user_name, device.kv.level, device.kv.angle);
                    }

                    service.getCharacteristic(this.Characteristic.CurrentPosition).updateValue(device.kv.level);
                    if (device.kv.angle !== undefined) {
                        service.getCharacteristic(this.Characteristic.CurrentHorizontalTiltAngle).updateValue(device.kv.angle);
                    }
                }
            });
        });
    }
}

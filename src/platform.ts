import { API, Categories, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CalypshomeAccessory, DeviceType } from './platformAccessory';
import { CalypsHome } from './calypshome';

export class CalypshomePlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];
    calypshome: CalypsHome;

    constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.calypshome = new CalypsHome(this.config as any, log);
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            void this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        return this.calypshome.devices().then((devices) => {
            devices.forEach((device) => {
                // generate a unique id for the accessory this should be generated from
                // something globally unique, but constant, for example, the device serial
                // number or MAC address
                const uuid = this.api.hap.uuid.generate(device.id.toString());
                // this.log.info('Discovered device:', device);

                // see if an accessory with the same uuid has already been registered and restored from
                // the cached devices we stored in the `configureAccessory` method above
                const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid) as PlatformAccessory<DeviceType> | undefined;

                if (existingAccessory) {
                    // the accessory already exists
                    this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                    // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                    existingAccessory.context = device;
                    this.api.updatePlatformAccessories([existingAccessory]);

                    // create the accessory handler for the restored accessory
                    // this is imported from `platformAccessory.ts`
                    new CalypshomeAccessory(this, existingAccessory);

                    // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                    // remove platform accessories when no longer present
                    // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                    // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                } else {
                    // the accessory does not yet exist, so we need to create it
                    this.log.info('Adding new accessory:', device.name);

                    // create a new accessory
                    const accessory = new this.api.platformAccessory<DeviceType>(device.name, uuid, Categories.WINDOW_COVERING);

                    // store a copy of the device object in the `accessory.context`
                    // the `context` property can be used to store any data about the accessory you may need
                    accessory.context = device;

                    // create the accessory handler for the newly create accessory
                    // this is imported from `platformAccessory.ts`
                    new CalypshomeAccessory(this, accessory);

                    // link the accessory to your platform
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
            });
        });
    }
}

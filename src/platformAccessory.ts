import { Service, PlatformAccessory } from 'homebridge';
import { CalypshomePlatform } from './platform';

export type DeviceType = {
    id: number;
    gw: string;
    kv: {
        level: string;
        __user_name: string;
        alert_message: string;
        manufacturer_name: string;
        product_name: string;
        angle?: string;
        present: string;
        status: 'down' | 'up';
    };
    name: string;
    manufacturer: string;
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class CalypshomeAccessory {
    private service: Service;

    constructor(private readonly platform: CalypshomePlatform, private readonly accessory: PlatformAccessory<DeviceType>) {
        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!.setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.manufacturer);

        this.service = this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering);

        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.name);

        // @see https://developers.homebridge.io/#/characteristic/TargetPosition

        // create handlers for required characteristics
        this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition).onGet(this.getCurrentPosition.bind(this));

        if (this.accessory.context.kv.angle !== undefined) {
            this.service.getCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle).onGet(this.getAngle.bind(this));
            this.service.getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle).onSet(this.setAngle.bind(this));
        }

        this.service.getCharacteristic(this.platform.Characteristic.PositionState).onGet(this.getPositionState.bind(this));
        this.service.getCharacteristic(this.platform.Characteristic.TargetPosition).onGet(this.getTargetPosition.bind(this)).onSet(this.setTargetPosition.bind(this));
    }

    getAngle() {
        this.platform.log.debug('Triggered getAngle', this.accessory.context.name, this.accessory.context.kv.angle);
        return Number(this.accessory.context.kv.angle);
    }

    getCurrentPosition() {
        this.platform.log.debug('Triggered getCurrentPosition', this.accessory.context.name, this.accessory.context.kv.level);
        return Number(this.accessory.context.kv.level);
    }

    getPositionState() {
        // this.platform.log.debug('Triggered getPositionState', this.accessory.context.name, this.accessory.context);
        return this.platform.Characteristic.PositionState.STOPPED;
    }

    getTargetPosition() {
        // this.platform.log.debug('Triggered GET TargetPosition');
        return this.getCurrentPosition();
    }

    setTargetPosition(value) {
        this.platform.log.debug('SET TargetPosition', this.accessory.displayName, value);
        this.platform.calypshome.action({ id: this.accessory.context.id, gw: this.accessory.context.gw }, 'LEVEL', `level=${value}`);
    }

    setAngle(value) {
        this.platform.log.debug('SET setAngle', this.accessory.displayName, value);
        this.platform.calypshome.action({ id: this.accessory.context.id, gw: this.accessory.context.gw }, 'TILT', `angle=${value}`);
    }
}

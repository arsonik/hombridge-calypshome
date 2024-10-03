// eslint-disable-next-line node/no-unpublished-import
import { CalypshomeAPI } from '../src/calypshomeAPI';
import assert from 'node:assert';

(async () => {
    assert(process.env.USERNAME, new Error('USERNAME not set'));
    assert(process.env.PASSWORD, new Error('PASSWORD not set'));
    const calypshome = new CalypshomeAPI({url:'http://192.168.0.217'}, console as any);
    await calypshome
            .devices()
            .then((devices) => devices.find((d) => d.name === 'Office'))
            .then(async (device) => {
                assert(device, new Error('Device not found'));
                console.log('Device:', device);
                await calypshome.action({ id: device.id }, 'OPEN', {level: '70'});
                // await calypshome.action({ id: device.id, gw: device.gw }, 'LEVEL', 'level=50');
                await new Promise((resolve) => {
                    setTimeout(resolve, 2000);
                });
                return calypshome.action({ id: device.id }, 'STOP');
            })
    // eslint-disable-next-line no-process-exit
    process.exit(0);
})();

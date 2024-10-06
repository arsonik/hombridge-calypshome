// eslint-disable-next-line node/no-unpublished-import
import { CalypshomeAPI } from '../src/calypshomeAPI';
import assert from 'node:assert';

(async () => {
    assert(process.env.URL, new Error('URL not set'));
    const calypshome = new CalypshomeAPI({url:process.env.URL}, console as any);
    await calypshome
            .devices()
            .then((devices) => devices.find((d) => d.name === 'Cinema'))
            .then(async (device) => {
                assert(device, new Error('Device not found'));
                console.log('Device:', device);
                // await calypshome.action({ id: device.id }, 'CLOSE');
                await calypshome.action(device.id, 'CLOSE');
                // await calypshome.action({ id: device.id, gw: device.gw }, 'LEVEL', 'level=50');
                // await new Promise((resolve) => {
                //     setTimeout(resolve, 2000);
                // });
                return calypshome.action(device.id, 'STOP');
            })
    // eslint-disable-next-line no-process-exit
    process.exit(0);
})();

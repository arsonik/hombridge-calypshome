import { CalypsHome } from '../src/calypshome';
import assert from 'node:assert';

(() => {
    assert(process.env.USERNAME, new Error('USERNAME not set'));
    assert(process.env.PASSWORD, new Error('PASSWORD not set'));
    const calypshome = new CalypsHome({ username: process.env.USERNAME, password: process.env.PASSWORD }, console);
    calypshome.login().then(() => {
        calypshome
            .devices()
            .then((devices) => {
                console.log(devices);

                return devices.find((d) => d.name === 'Office');
            })
            .then(async (device) => {
                assert(device, new Error('Device not found'));
                await calypshome.action({ id: device.id, gw: device.gw }, 'LEVEL', 'level=50');
                await new Promise((resolve) => {
                    setTimeout(resolve, 5000);
                });
                await calypshome.action({ id: device.id, gw: device.gw }, 'STOP');
                process.exit(0);
            });
    });
})();

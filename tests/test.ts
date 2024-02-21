// eslint-disable-next-line node/no-unpublished-import
import { CalypsHome } from '../src/calypshome';
import assert from 'node:assert';

(async () => {
    assert(process.env.USERNAME, new Error('USERNAME not set'));
    assert(process.env.PASSWORD, new Error('PASSWORD not set'));
    const calypshome = new CalypsHome({ username: process.env.USERNAME, password: process.env.PASSWORD }, console);
    await calypshome.login().then(async () =>
        calypshome
            .devices()
            .then((devices) => {
                console.log(devices);
                return devices.find((d) => d.name === 'Office');
            })
            .then(async (device) => {
                assert(device, new Error('Device not found'));
                calypshome.sessionId = 'buggy-session-id';
                await calypshome.action({ id: device.id, gw: device.gw }, 'LEVEL', 'level=50');
                await new Promise((resolve) => {
                    setTimeout(resolve, 5000);
                });
                return calypshome.action({ id: device.id, gw: device.gw }, 'STOP');
            })
    );
    // eslint-disable-next-line no-process-exit
    process.exit(0);
})();

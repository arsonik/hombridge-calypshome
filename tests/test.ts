import { CalypsHome } from '../src/calypshome';

(() => {
    const calypshome = new CalypsHome({ username: process.env.USERNAME ?? '', password: process.env.PASSWORD ?? '' }, console);
    calypshome.login().then(() => {
        calypshome.devices().then((devices) => {
            console.log(devices);
            process.exit(0);
        });
    });
})();

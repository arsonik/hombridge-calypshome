import { API } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CalypshomePlatform } from './platform';

export = (api: API) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, CalypshomePlatform);
};

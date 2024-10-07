import { z } from 'zod';
import { getObjectsSchema } from './calypshomeAPI';

export class RollingShutter {
    id: string;
    actions: Exclude<z.infer<typeof getObjectsSchema>['objects'][number]['actions'], 'SCAN' | 'JOIN'>;
    name: string;
    angle: number | undefined;
    level: number | undefined;
    manufacturerName: string;
    serialNumber: string;

    constructor(data: z.infer<typeof getObjectsSchema>['objects'][number]) {
        this.id = data.id;
        this.name = data.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.actions = data.actions.filter((a) => a !== 'SCAN') as any;

        const angle = data.status.find((s) => s.name === 'angle')?.value;
        this.angle = typeof angle === 'string' ? Number(angle) : undefined;
        const level = data.status.find((s) => s.name === 'level')?.value;
        this.level = typeof level === 'string' ? Number(level) : undefined;
        this.manufacturerName = data.status?.find((c) => c.name === 'manufacturer_name')?.value ?? 'n/a';
        this.serialNumber = this.id.replace(/^.*IEEEAddr-(.*):.*$/, '$1');
    }
}

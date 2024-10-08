import { z } from 'zod';

export const getObjectsResponseSchema = z.object({
    objects: z.array(
        z.object({
            room: z.object({
                id: z.number(),
                name: z.string(),
            }),
            id: z.string(),
            status: z.array(
                z.object({
                    value: z.string(),
                    name: z.string(),
                    time: z.string(),
                })
            ),
            categories: z.unknown(),
            name: z.string(),
            type: z.enum(['Rolling_Shutter', 'Composite', 'EZSP']),
            img: z.string(),
            gw: z.string(),
            eventId: z.string(),
            connected: z.boolean(),
            actions: z.array(z.enum(['OPEN', 'CLOSE', 'STOP', 'LEVEL', 'TILT', 'SCAN', 'JOIN'])),
        })
    ),
});

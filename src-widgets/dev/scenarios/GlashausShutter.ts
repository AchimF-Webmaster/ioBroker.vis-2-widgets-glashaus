import type { Scenario } from '../scenario';

export default [
    { widget: 'GlashausShutter', name: 'demo', w: 360, h: 280 },
    {
        widget: 'GlashausShutter',
        name: 'homematic',
        w: 360,
        h: 280,
        data: {
            title: 'Rollladen Büro',
            oid: 'harness.0.blind.LEVEL',
            oidStop: 'harness.0.blind.STOP',
            oidWorking: 'harness.0.blind.WORKING',
            oidDirection: 'harness.0.blind.DIRECTION',
        },
        states: {
            'harness.0.blind.LEVEL': { val: 40, unit: '%' },
            'harness.0.blind.STOP': { val: false, type: 'boolean' },
            'harness.0.blind.WORKING': { val: false, type: 'boolean' },
            'harness.0.blind.DIRECTION': { val: 0 },
        },
    },
    {
        widget: 'GlashausShutter',
        name: 'moving',
        w: 360,
        h: 280,
        data: { title: 'Wohnzimmer', oid: 'harness.0.blind2.LEVEL', oidDirection: 'harness.0.blind2.DIRECTION', accent: 'teal' },
        states: {
            'harness.0.blind2.LEVEL': { val: t => Math.round(50 + 50 * Math.sin(t / 20000)) },
            'harness.0.blind2.DIRECTION': { val: 2 },
        },
    },
    { widget: 'GlashausShutter', name: 'small', w: 260, h: 200, data: { title: 'Bad' } },
    { widget: 'GlashausShutter', name: 'strip', w: 360, h: 140, data: { title: 'Küche' } },
] satisfies Scenario[];

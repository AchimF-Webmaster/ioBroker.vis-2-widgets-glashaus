import type { Scenario, StateDef } from '../scenario';

/** Simulated tankerkoenig-like stations below harness.0.stations */
const names = ['Tankstelle Mitte', 'Autohof West', 'Ring-Tankstelle', 'An der B3', 'Freie Station Ost', 'Industriestraße', 'Am Kreisel', 'Nordring'];
const states: Record<string, StateDef> = {};
names.forEach((n, i) => {
    const b = `harness.0.stations.${i}`;
    states[`${b}.name`] = { val: n, type: 'string' };
    states[`${b}.status`] = { val: i === 3 ? 'closed' : 'open', type: 'string' };
    states[`${b}.e5.feed`] = { val: t => Math.round((1.859 + ((i * 7) % 5) * 0.01 + 0.01 * Math.sin(t / 30000 + i)) * 1000) / 1000 };
    states[`${b}.e10.feed`] = { val: Math.round((1.799 + ((i * 3) % 5) * 0.01) * 1000) / 1000 };
    states[`${b}.diesel.feed`] = { val: Math.round((1.709 + ((i * 5) % 4) * 0.01) * 1000) / 1000 };
});

export default [
    { widget: 'GlashausFuel', name: 'demo', w: 460, h: 460 },
    {
        widget: 'GlashausFuel',
        name: 'live',
        w: 460,
        h: 520,
        data: { base: 'harness.0.stations', count: 8, showDiesel: true },
        states,
    },
    {
        widget: 'GlashausFuel',
        name: 'wide',
        w: 860,
        h: 360,
        data: { base: 'harness.0.stations', count: 8, title: 'Tanken', fuel: 'e10' },
    },
    { widget: 'GlashausFuel', name: 'small', w: 320, h: 260, data: { showE10: false, count: 4 } },
] satisfies Scenario[];

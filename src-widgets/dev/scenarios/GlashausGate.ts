import type { Scenario } from '../scenario';

export default [
    { widget: 'GlashausGate', name: 'demo', w: 420, h: 280 },
    {
        widget: 'GlashausGate',
        name: 'open',
        w: 420,
        h: 280,
        data: { title: 'Hoftor', oidState: 'harness.0.gate_state', oidCommand: 'harness.0.gate_cmd' },
        states: {
            'harness.0.gate_state': { val: 1, name: 'DOOR_STATE' },
            'harness.0.gate_cmd': { val: 0, name: 'DOOR_COMMAND' },
        },
    },
    {
        widget: 'GlashausGate',
        name: 'partial',
        w: 420,
        h: 280,
        data: { title: 'Garage', oidState: 'harness.0.gate_state2', oidCommand: 'harness.0.gate_cmd', accent: 'teal' },
        states: { 'harness.0.gate_state2': { val: 2 } },
    },
    {
        widget: 'GlashausGate',
        name: 'moving',
        w: 420,
        h: 280,
        data: {
            title: 'Einfahrt',
            oidState: 'harness.0.gate_state3',
            oidMoving: 'harness.0.gate_moving',
            cmdMode: 'each',
            oidOpen: 'harness.0.gate_open',
            oidClose: 'harness.0.gate_close',
            showPartial: false,
        },
        states: {
            'harness.0.gate_state3': { val: false },
            'harness.0.gate_moving': { val: true },
            'harness.0.gate_open': { val: false },
            'harness.0.gate_close': { val: false },
        },
    },
    { widget: 'GlashausGate', name: 'narrow', w: 300, h: 190, data: { title: 'Tor' } },
    { widget: 'GlashausGate', name: 'strip', w: 520, h: 120, data: { title: 'Garagentor mit sehr langem Namen' } },
] satisfies Scenario[];

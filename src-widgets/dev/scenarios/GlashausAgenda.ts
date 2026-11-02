import type { Scenario } from '../scenario';

/** ical-like table (data.table) relative to today, with HTML like ical adds for colors */
function day(offset: number, h = 0, m = 0): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
}
const ev = (s: Date, e: Date, event: string, location = '', allDay = false): Record<string, unknown> => ({
    date: '',
    event,
    _class: '',
    _date: s.toISOString(),
    _end: e.toISOString(),
    location,
    _allDay: allDay,
});
const termine = [
    ev(day(0, 8), day(0, 8, 30), 'Physio'),
    ev(day(0), day(1), '<span style="color:red">Geburtstag Paul</span>', '', true),
    ev(day(2, 17, 30), day(2, 19), 'Vereinssitzung', 'Vereinsheim'),
    ev(day(5, 12), day(5, 12, 30), 'Fußpflege'),
    ev(day(5, 12), day(5, 12, 15), 'Rückruf Versicherung'),
    ev(day(8), day(9), 'Urlaub', '', true),
];
const muell = [
    ev(day(1), day(2), 'Gelber Sack', 'Musterweg', true),
    ev(day(3), day(4), 'Gartenabfälle', 'Musterweg', true),
    ev(day(6), day(7), 'Hausmüll', 'Musterweg', true),
    ev(day(9), day(10), 'Sonderabfall', 'Musterweg Info: 15:30-17:30 Bauhof', true),
    ev(day(12), day(13), 'Biotonne', 'Musterweg', true),
    ev(day(20), day(21), 'Papier', 'Musterweg', true),
];

export default [
    { widget: 'GlashausAgenda', name: 'demo', w: 420, h: 460 },
    { widget: 'GlashausAgenda', name: 'demo-waste', w: 420, h: 330, data: { mode: 'waste' } },
    {
        widget: 'GlashausAgenda',
        name: 'live',
        w: 420,
        h: 460,
        data: { oid: 'harness.0.ical_table', oid2: 'harness.0.muell_table', exclude: 'Rückruf' },
        states: {
            'harness.0.ical_table': { val: JSON.stringify(termine), type: 'string' },
            'harness.0.muell_table': { val: JSON.stringify(muell), type: 'string' },
        },
    },
    {
        widget: 'GlashausAgenda',
        name: 'live-waste',
        w: 640,
        h: 300,
        data: { mode: 'waste', oid: 'harness.0.muell_table', days: 30 },
    },
    { widget: 'GlashausAgenda', name: 'small-waste', w: 280, h: 360, data: { mode: 'waste', wasteCount: 4 } },
] satisfies Scenario[];

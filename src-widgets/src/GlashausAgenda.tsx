/* Agenda: appointments from the ical adapter (data.table) grouped by day, or the next waste collections
 * as tiles ("Gelber Sack · morgen"). Up to two calendars can be merged, each with its own accent.
 * The table of ical is an array of { event, _date, _end, location, _allDay, … }; HTML in the text is removed. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, accentColor, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox } from './core/components';
import { fmtDate, fmtTime, localeOf, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

const WASTE_MAX = 8;
/** Default waste types: i18n key of label and keywords, accent */
const WASTE_DEFAULTS: { key: string; accent: string }[] = [
    { key: 'rest', accent: 'fg' },
    { key: 'bio', accent: 'batt' },
    { key: 'paper', accent: 'home' },
    { key: 'yellow', accent: 'sun' },
    { key: 'garden', accent: 'teal' },
    { key: 'hazard', accent: 'rose' },
];

interface AgendaRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    mode: 'agenda' | 'waste';
    oid: string;
    oid2: string;
    accent2: string;
    color2: string;
    days: number | string;
    maxItems: number | string;
    exclude: string;
    showLocation: boolean | string;
    wasteCount: number | string;
    [key: `wLabel${number}`]: string;
    [key: `wKeys${number}`]: string;
    [key: `wAccent${number}`]: string;
}

interface Item {
    start: number;
    end: number;
    allDay: boolean;
    text: string;
    location: string;
    src: 1 | 2;
}

type AgendaState = VisRxWidgetState;

const isAgenda = (data: WidgetData): boolean => data.mode !== 'waste';
const isWaste = (data: WidgetData): boolean => data.mode === 'waste';

const CSS = `
.gh.gh-ag{container:gh-ag/size;padding:20px 22px 10px}
.gh-ag .gh-h{flex-wrap:nowrap;margin-bottom:10px}
.gh-ag-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-ag-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin-right:-4px;padding-right:4px;
  scrollbar-width:thin;scrollbar-color:var(--gh-track) transparent;
  -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent);
  mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent)}
.gh-ag-day{margin:0 0 4px}
.gh-ag-dh{display:flex;align-items:baseline;gap:8px;padding:10px 0 4px;font-size:13px;color:var(--gh-fg-2)}
.gh-ag-dh .gh-it{font-size:22px;color:var(--gh-fg);line-height:1}
.gh-ag-ul{list-style:none;margin:0;padding:0}
.gh-ag-li{display:grid;grid-template-columns:8px 64px minmax(0,1fr);gap:10px;align-items:baseline;padding:7px 0;
  border-bottom:1px solid var(--gh-track);font-size:14px;line-height:1.35}
.gh-ag-li:last-child{border-bottom:0}
.gh-ag-dot{width:8px;height:8px;border-radius:50%;background:var(--gh-c);align-self:center}
.gh-ag-tm{font-size:12.5px;color:var(--gh-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.gh-ag-tx{min-width:0;overflow-wrap:anywhere}
.gh-ag-loc{display:block;font-size:12px;color:var(--gh-fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ag-empty{padding:12px 0;color:var(--gh-fg-2);font-size:13.5px}
.gh-ag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
.gh-ag-w{position:relative;display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:var(--gh-r-m);
  background:color-mix(in srgb,var(--gh-c) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gh-c) 18%,transparent);min-width:0}
.gh-ag-w .gh-ico{width:30px;height:30px;border-radius:10px}
.gh-ag-w .gh-ico svg{width:17px;height:17px}
.gh-ag-wl{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ag-wr{font-size:24px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ag-wd{font-size:12px;color:var(--gh-fg-2);white-space:nowrap}
.gh-ag-w.soon{background:var(--gh-c);box-shadow:none;color:var(--gh-bg)}
.gh-ag-w.soon .gh-ag-wd{color:color-mix(in srgb,var(--gh-bg) 72%,transparent)}
.gh-ag-w.soon .gh-ico{background:color-mix(in srgb,var(--gh-bg) 20%,transparent);color:var(--gh-bg)}
.gh-ag-w.none{opacity:.5}
@container gh-ag (max-width:300px){
  .gh-ag-li{grid-template-columns:8px 52px minmax(0,1fr);gap:8px}
  .gh-ag-grid{grid-template-columns:1fr 1fr}
  .gh-ag-wr{font-size:20px}
}
`;

/** Removes HTML tags and entities that ical adds for colors */
function plain(s: unknown): string {
    if (typeof s !== 'string') {
        return '';
    }
    return s
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTs(v: unknown): number | null {
    if (typeof v === 'number') {
        return v;
    }
    if (typeof v === 'string' && v) {
        const t = Date.parse(v);
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

/** Start of the local day */
function dayStart(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Whole days between today and t (local calendar days) */
function dayDiff(t: number, now: number): number {
    return Math.round((dayStart(t) - dayStart(now)) / 86400000);
}

/** Parses the table of the ical adapter (array or JSON text) */
function parseTable(raw: unknown, src: 1 | 2): Item[] {
    let arr: any = raw;
    if (typeof raw === 'string') {
        try {
            arr = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(arr)) {
        return [];
    }
    const items: Item[] = [];
    for (const r of arr) {
        if (!r || typeof r !== 'object') {
            continue;
        }
        const start = toTs(r._date ?? r.start ?? r.date);
        if (start === null) {
            continue;
        }
        const end = toTs(r._end ?? r.end) ?? start;
        const s = new Date(start);
        const allDay =
            r._allDay === true ||
            r._allDay === 'true' ||
            (s.getHours() === 0 && s.getMinutes() === 0 && (end - start) % 86400000 === 0 && end > start);
        items.push({
            start,
            end,
            allDay,
            text: plain(r.event ?? r.summary ?? r.title),
            location: plain(r.location),
            src,
        });
    }
    return items;
}

/** Demo appointments relative to today (invented) */
function demoItems(now: number): Item[] {
    const at = (days: number, h: number, m = 0): number => {
        const d = new Date(dayStart(now) + days * 86400000);
        d.setHours(h, m, 0, 0);
        return d.getTime();
    };
    const all = (days: number): [number, number] => [at(days, 0), at(days + 1, 0)];
    const mk = (s: number, e: number, text: string, allDay = false, location = '', src: 1 | 2 = 1): Item => ({
        start: s,
        end: e,
        allDay,
        text,
        location,
        src,
    });
    return [
        mk(at(0, 9, 30), at(0, 10, 15), GlashausWidget.tr('ag_demo_1'), false, GlashausWidget.tr('ag_demo_loc_1')),
        mk(...all(0), GlashausWidget.tr('ag_demo_2'), true, '', 2),
        mk(at(1, 18), at(1, 19, 30), GlashausWidget.tr('ag_demo_3')),
        mk(...all(1), GlashausWidget.tr('ag_waste_label_yellow'), true, '', 2),
        mk(...all(3), GlashausWidget.tr('ag_waste_label_bio'), true, '', 2),
        mk(at(4, 12), at(4, 12, 30), GlashausWidget.tr('ag_demo_4'), false, GlashausWidget.tr('ag_demo_loc_4')),
        mk(...all(6), GlashausWidget.tr('ag_waste_label_rest'), true, '', 2),
        mk(...all(9), GlashausWidget.tr('ag_waste_label_paper'), true, '', 2),
        mk(at(10, 20), at(10, 22), GlashausWidget.tr('ag_demo_5')),
        mk(...all(13), GlashausWidget.tr('ag_waste_label_garden'), true, '', 2),
    ];
}

export default class GlashausAgenda extends GlashausWidget<AgendaRxData, AgendaState> {
    private cache: { key: string; items: Item[] } = { key: '', items: [] };

    private dayTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('agenda', CSS);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausAgenda',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Agenda',
            visWidgetLabel: 'ag_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'mode',
                            label: 'ag_mode',
                            type: 'select',
                            options: [
                                { value: 'agenda', label: 'ag_mode_agenda' },
                                { value: 'waste', label: 'ag_mode_waste' },
                            ],
                            default: 'agenda',
                        },
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields(''),
                        ...GlashausWidget.accentFields('', 'home'),
                        { name: 'oid', label: 'ag_oid', type: 'id', tooltip: 'ag_oid_tip' },
                        { name: 'oid2', label: 'ag_oid2', type: 'id', hidden: isWaste, tooltip: 'ag_oid2_tip' },
                        ...GlashausWidget.accentFields('', 'rose', 'ag_accent2').map(f => ({
                            ...f,
                            name: f.name === 'accent' ? 'accent2' : 'color2',
                            hidden:
                                f.name === 'accent' ? isWaste : 'data.mode === "waste" || data.accent2 !== "custom"',
                        })),
                        { name: 'days', label: 'ag_days', type: 'slider', min: 1, max: 90, default: 14 },
                        {
                            name: 'maxItems',
                            label: 'ag_max',
                            type: 'slider',
                            min: 1,
                            max: 50,
                            default: 20,
                            hidden: isWaste,
                        },
                        { name: 'exclude', label: 'ag_exclude', tooltip: 'ag_exclude_tip', hidden: isWaste },
                        {
                            name: 'showLocation',
                            label: 'ag_show_location',
                            type: 'checkbox',
                            default: true,
                            hidden: isWaste,
                        },
                        {
                            name: 'wasteCount',
                            label: 'ag_waste_count',
                            type: 'slider',
                            min: 1,
                            max: WASTE_MAX,
                            default: 6,
                            hidden: isAgenda,
                        },
                    ],
                },
                {
                    name: 'ag_waste',
                    label: 'group_ag_waste',
                    indexFrom: 1,
                    indexTo: 'wasteCount',
                    hidden: isAgenda,
                    fields: [
                        { name: 'wLabel', label: 'ag_w_label', tooltip: 'ag_w_label_tip' },
                        { name: 'wKeys', label: 'ag_w_keys', tooltip: 'ag_w_keys_tip' },
                        {
                            name: 'wAccent',
                            label: 'accent',
                            type: 'select',
                            options: [
                                { value: '', label: 'ag_w_accent_auto' },
                                ...['fg', 'sun', 'batt', 'grid', 'home', 'heat', 'cool', 'teal', 'rose'].map(a => ({
                                    value: a,
                                    label: `accent_${a}`,
                                })),
                            ],
                            default: '',
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 420, height: 460, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_agenda.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausAgenda.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.scheduleMidnight();
    }

    componentWillUnmount(): void {
        if (this.dayTimer) {
            clearTimeout(this.dayTimer);
        }
        super.componentWillUnmount();
    }

    /** Re-render shortly after midnight, so that "today" and "tomorrow" move on */
    private scheduleMidnight(): void {
        const now = Date.now();
        const next = dayStart(now) + 86400000 + 5000;
        this.dayTimer = setTimeout(() => {
            this.forceUpdate();
            this.scheduleMidnight();
        }, next - now);
    }

    private items(now: number): Item[] {
        const d = this.state.rxData;
        if (!isOid(d.oid)) {
            return demoItems(now);
        }
        const r1 = this.ghVal(d.oid);
        const r2 = d.mode !== 'waste' && isOid(d.oid2) ? this.ghVal(d.oid2) : undefined;
        const key = `${typeof r1 === 'string' ? r1 : JSON.stringify(r1)}|${typeof r2 === 'string' ? r2 : JSON.stringify(r2)}`;
        if (key !== this.cache.key) {
            this.cache = { key, items: [...parseTable(r1, 1), ...(r2 !== undefined ? parseTable(r2, 2) : [])] };
        }
        return this.cache.items;
    }

    /** Relative day: "heute", "morgen", "übermorgen", "in 5 Tagen" */
    private relDay(diff: number): string {
        const rtf = new Intl.RelativeTimeFormat(localeOf(this.ghLang()), { numeric: 'auto' });
        return rtf.format(diff, 'day');
    }

    private renderAgenda(items: Item[], now: number): React.JSX.Element {
        const d = this.state.rxData;
        const lang = this.ghLang();
        const days = Math.max(1, toNum(d.days) || 14);
        const max = Math.max(1, toNum(d.maxItems) || 20);
        const until = dayStart(now) + days * 86400000;
        const excl = (d.exclude || '')
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
        const list = items
            .filter(i => (i.end > i.start ? i.end > now : dayStart(i.start) >= dayStart(now)) && i.start < until)
            .filter(i => !excl.some(x => i.text.toLowerCase().includes(x)))
            .sort((a, b) => a.start - b.start || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1))
            .slice(0, max);
        if (!list.length) {
            return <div className="gh-ag-empty">{GlashausWidget.tr('ag_empty')}</div>;
        }
        const c1 = this.ghAccent('', 'home');
        const c2 = accentColor(d.accent2, d.color2, 'rose');
        const groups: { day: number; items: Item[] }[] = [];
        for (const it of list) {
            // running multi-day events are shown today
            const day = Math.max(dayStart(it.start), dayStart(now));
            const g = groups.find(x => x.day === day);
            if (g) {
                g.items.push(it);
            } else {
                groups.push({ day, items: [it] });
            }
        }
        const showLoc = isTrue(d.showLocation, true);
        return (
            <div className="gh-ag-scroll">
                {groups.map(g => {
                    const diff = dayDiff(g.day, now);
                    const rel = diff <= 2 ? this.relDay(diff) : fmtDate(g.day, lang, { weekday: 'long' });
                    return (
                        <section
                            key={g.day}
                            className="gh-ag-day"
                        >
                            <div className="gh-ag-dh">
                                <span className="gh-it">{rel.charAt(0).toUpperCase() + rel.slice(1)}</span>
                                <span>{fmtDate(g.day, lang, { day: 'numeric', month: 'long' })}</span>
                            </div>
                            <ul className="gh-ag-ul">
                                {g.items.map((it, i) => (
                                    <li
                                        key={i}
                                        className="gh-ag-li"
                                        style={{ '--gh-c': it.src === 2 ? c2 : c1 } as React.CSSProperties}
                                    >
                                        <span className="gh-ag-dot" />
                                        <span className="gh-ag-tm">
                                            {it.allDay ? GlashausWidget.tr('ag_all_day') : fmtTime(it.start, lang)}
                                        </span>
                                        <span className="gh-ag-tx">
                                            {it.text || '–'}
                                            {showLoc && it.location ? (
                                                <span className="gh-ag-loc">{it.location}</span>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
        );
    }

    private renderWaste(items: Item[], now: number): React.JSX.Element {
        const d = this.state.rxData;
        const lang = this.ghLang();
        const n = Math.max(1, Math.min(WASTE_MAX, toNum(d.wasteCount) || 6));
        const days = Math.max(1, toNum(d.days) || 14);
        const today = dayStart(now);
        const future = items.filter(i => dayStart(i.start) >= today).sort((a, b) => a.start - b.start);
        const tiles: { label: string; accent: string; next: Item | null; order: number }[] = [];
        for (let i = 1; i <= n; i++) {
            const def = WASTE_DEFAULTS[i - 1];
            const label = d[`wLabel${i}`] || (def ? GlashausWidget.tr(`ag_waste_label_${def.key}`) : '');
            const keysRaw = d[`wKeys${i}`] || (def ? GlashausWidget.tr(`ag_waste_keys_${def.key}`) : '') || label;
            const keys = keysRaw
                .split(',')
                .map(s => s.trim().toLowerCase())
                .filter(Boolean);
            if (!label || !keys.length) {
                continue;
            }
            const next = future.find(it => keys.some(k => it.text.toLowerCase().includes(k))) || null;
            const accent = accentColor(d[`wAccent${i}`] || def?.accent || 'fg', undefined, 'fg');
            tiles.push({ label, accent, next, order: next ? next.start : Infinity });
        }
        tiles.sort((a, b) => a.order - b.order);
        const shown = tiles.filter(t => t.next && dayDiff(t.next.start, now) < days);
        const rest = tiles.filter(t => !shown.includes(t));
        if (!tiles.length) {
            return <div className="gh-ag-empty">{GlashausWidget.tr('ag_empty')}</div>;
        }
        return (
            <div className="gh-ag-scroll">
                <div className="gh-ag-grid">
                    {[...shown, ...rest].map(t => {
                        const diff = t.next ? dayDiff(t.next.start, now) : null;
                        return (
                            <div
                                key={t.label}
                                className={`gh-ag-w${diff !== null && diff <= 1 ? ' soon' : ''}${diff === null || !shown.includes(t) ? ' none' : ''}`}
                                style={{ '--gh-c': t.accent } as React.CSSProperties}
                            >
                                <span className="gh-ico">
                                    <GhIcon name="trash" />
                                </span>
                                <span className="gh-ag-wl">{t.label}</span>
                                <span className="gh-it gh-ag-wr">
                                    {diff === null ? GlashausWidget.tr('ag_no_date') : this.relDay(diff)}
                                </span>
                                <span className="gh-ag-wd">
                                    {t.next
                                        ? fmtDate(t.next.start, lang, {
                                              weekday: 'short',
                                              day: 'numeric',
                                              month: 'short',
                                          })
                                        : '–'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const now = Date.now();
        const demo = !isOid(d.oid);
        const waste = d.mode === 'waste';
        const items = this.items(now);
        const accent = this.ghAccent('', 'home');
        const title = d.title || GlashausWidget.tr(waste ? 'ag_default_title_waste' : 'ag_default_title');
        const icon = this.ghIcon() || (waste ? 'trash' : 'clock');

        return (
            <div className={this.ghClass('gh-ag')}>
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={icon}
                            color={accent}
                        />
                        <span className="gh-ag-t">{title}</span>
                    </h2>
                    <span className="gh-muted gh-small">
                        {fmtDate(now, this.ghLang(), { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                </div>
                {waste ? this.renderWaste(items, now) : this.renderAgenda(items, now)}
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

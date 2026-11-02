/* Fuel prices: a list of filling stations sorted by price, the cheapest open one highlighted,
 * switchable between Super E5, E10 and Diesel. Reads the states of the tankerkoenig adapter
 * (<base>.<n>.name, .status, .e5.feed, .e10.feed, .diesel.feed); the suffixes can be changed for other sources. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isTrue } from './core/GlashausWidget';
import { GhIconBox, GhPill } from './core/components';
import { fmtNum, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

type Fuel = 'e5' | 'e10' | 'diesel';
const FUELS: Fuel[] = ['e5', 'e10', 'diesel'];
const MAX = 12;

interface FuelRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    base: string;
    count: number | string;
    sufName: string;
    sufStatus: string;
    sufE5: string;
    sufE10: string;
    sufDiesel: string;
    showE5: boolean | string;
    showE10: boolean | string;
    showDiesel: boolean | string;
    fuel: Fuel;
    hideClosed: boolean | string;
    columns: 'auto' | '1' | '2';
    advanced: boolean | string;
    [key: `label${number}`]: string;
}

interface FuelState extends VisRxWidgetState {
    /** Fuel chosen with the tabs (null: the default of the attributes) */
    tab: Fuel | null;
    /** Values of the subscribed station IDs */
    st: Record<string, ioBroker.StateValue>;
}

interface Row {
    i: number;
    name: string;
    open: boolean;
    price: number | null;
}

/** Invented demo stations (no real places) */
const DEMO: { name: string; e5: number; e10: number; diesel: number; open: boolean }[] = [
    { name: 'Tankstelle am Markt', e5: 1.869, e10: 1.809, diesel: 1.729, open: true },
    { name: 'Autohof Nord', e5: 1.899, e10: 1.839, diesel: 1.749, open: true },
    { name: 'Freie Tankstelle Ring', e5: 1.849, e10: 1.789, diesel: 1.699, open: true },
    { name: 'Bahnhofstraße', e5: 1.879, e10: 1.819, diesel: 1.739, open: false },
    { name: 'Gewerbegebiet Süd', e5: 1.889, e10: 1.829, diesel: 1.719, open: true },
    { name: 'Landstraße 12', e5: 1.909, e10: 1.849, diesel: 1.759, open: true },
];

const notManual = (data: WidgetData): boolean => !isTrue(data.advanced);

const CSS = `
.gh.gh-fuel{container:gh-fuel/size;padding:20px 22px 12px}
.gh-fuel .gh-h{flex-wrap:nowrap;margin-bottom:12px}
.gh-fuel-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-fuel-tabs{display:flex;gap:6px;flex:none}
.gh-fuel-tabs .gh-outline{height:30px;padding:0 12px;font-size:12.5px}
.gh-fuel-best{display:flex;align-items:baseline;gap:14px;margin:0 0 12px;min-width:0}
.gh-fuel-best .gh-num{font-size:44px;line-height:1;color:var(--gh-c)}
.gh-fuel-best-n{min-width:0;display:flex;flex-direction:column}
.gh-fuel-best-n b{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-fuel-list{list-style:none;margin:0 -4px 0 0;padding:0 4px 0 0;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
  display:grid;grid-template-columns:repeat(var(--gh-fuel-cols,1),minmax(0,1fr));column-gap:28px;align-content:start;
  scrollbar-width:thin;scrollbar-color:var(--gh-track) transparent}
.gh-fuel-li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:9px 0;
  border-bottom:1px solid var(--gh-track);font-size:14px}
.gh-fuel-nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-fuel-p{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;text-align:right}
.gh-fuel-p sup{font-size:.62em;margin-left:1px;vertical-align:.55em}
.gh-fuel-p .eur{font-weight:450;color:var(--gh-fg-2);margin-left:4px;font-size:.86em}
.gh-fuel-bar{grid-column:1/-1;height:4px;border-radius:4px;background:var(--gh-track);overflow:hidden}
.gh-fuel-bar i{display:block;height:100%;border-radius:4px;background:var(--gh-fg-3);transition:width .8s var(--gh-ease)}
.gh-fuel-li.best .gh-fuel-p{color:var(--gh-c)}
.gh-fuel-li.best .gh-fuel-bar i{background:var(--gh-c)}
.gh-fuel-li.closed{opacity:.5}
.gh-fuel-cl{font-size:12px;color:var(--gh-fg-3);margin-left:6px}
.gh-fuel-empty{padding:12px 0;color:var(--gh-fg-2);font-size:13.5px}
@container gh-fuel (max-height:300px){.gh-fuel-best{display:none}}
@container gh-fuel (min-width:640px){.gh-fuel-list.auto{--gh-fuel-cols:2}}
@container gh-fuel (max-width:360px){
  .gh-fuel .gh-h{flex-wrap:wrap}
  .gh-fuel-best .gh-num{font-size:36px}
}
`;

export default class GlashausFuel extends GlashausWidget<FuelRxData, FuelState> {
    private subKey = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('fuel', CSS);
        this.state = { ...this.state, tab: null, st: {} };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausFuel',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Fuel',
            visWidgetLabel: 'fuel_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('car'),
                        ...GlashausWidget.accentFields('', 'ok'),
                        { name: 'base', label: 'fuel_base', tooltip: 'fuel_base_tip' },
                        { name: 'count', label: 'fuel_count', type: 'slider', min: 1, max: MAX, default: 6 },
                        {
                            name: 'fuel',
                            label: 'fuel_default',
                            type: 'select',
                            options: FUELS.map(f => ({ value: f, label: `fuel_${f}` })),
                            default: 'e5',
                        },
                        { name: 'showE5', label: 'fuel_show_e5', type: 'checkbox', default: true },
                        { name: 'showE10', label: 'fuel_show_e10', type: 'checkbox', default: true },
                        { name: 'showDiesel', label: 'fuel_show_diesel', type: 'checkbox', default: false },
                        { name: 'hideClosed', label: 'fuel_hide_closed', type: 'checkbox', default: false },
                        {
                            name: 'columns',
                            label: 'fuel_columns',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'fuel_columns_auto' },
                                { value: '1', label: 'fuel_columns_1' },
                                { value: '2', label: 'fuel_columns_2' },
                            ],
                            default: 'auto',
                        },
                        { name: 'advanced', label: 'fuel_advanced', type: 'checkbox', default: false },
                        { name: 'sufName', label: 'fuel_suf_name', default: 'name', hidden: notManual },
                        {
                            name: 'sufStatus',
                            label: 'fuel_suf_status',
                            default: 'status',
                            hidden: notManual,
                            tooltip: 'fuel_suf_status_tip',
                        },
                        { name: 'sufE5', label: 'fuel_suf_e5', default: 'e5.feed', hidden: notManual },
                        { name: 'sufE10', label: 'fuel_suf_e10', default: 'e10.feed', hidden: notManual },
                        { name: 'sufDiesel', label: 'fuel_suf_diesel', default: 'diesel.feed', hidden: notManual },
                    ],
                },
                {
                    name: 'fuel_station',
                    label: 'group_fuel_station',
                    indexFrom: 1,
                    indexTo: 'count',
                    fields: [{ name: 'label', label: 'fuel_label', tooltip: 'fuel_label_tip' }],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 460, height: 460, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_fuel.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausFuel.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.subscribeStations();
    }

    onRxDataChanged(): void {
        this.subscribeStations();
    }

    private count(): number {
        return Math.max(1, Math.min(MAX, toNum(this.state.rxData.count) || 6));
    }

    private base(): string {
        return (this.state.rxData.base || '').trim().replace(/\.$/, '');
    }

    private suffixes(): Record<'name' | 'status' | Fuel, string> {
        const d = this.state.rxData;
        return {
            name: d.sufName || 'name',
            status: d.sufStatus || 'status',
            e5: d.sufE5 || 'e5.feed',
            e10: d.sufE10 || 'e10.feed',
            diesel: d.sufDiesel || 'diesel.feed',
        };
    }

    /** Subscribes all station IDs below the base path */
    private subscribeStations(): void {
        const base = this.base();
        const n = this.count();
        const suf = this.suffixes();
        const key = `${base}|${n}|${Object.values(suf).join(',')}`;
        if (key === this.subKey) {
            return;
        }
        this.subKey = key;
        this.ghUnsubscribeAll();
        this.setState({ st: {} });
        if (!base) {
            return;
        }
        const ids: string[] = [];
        for (let i = 0; i < n; i++) {
            Object.values(suf).forEach(s => ids.push(`${base}.${i}.${s}`));
        }
        this.ghSubscribe(ids, (id, state) => {
            if (this.subKey !== key) {
                return;
            }
            this.setState(prev => ({ st: { ...prev.st, [id]: state?.val ?? null } }));
        });
    }

    private fuels(): Fuel[] {
        const d = this.state.rxData;
        const list = FUELS.filter(f =>
            f === 'e5' ? isTrue(d.showE5, true) : f === 'e10' ? isTrue(d.showE10, true) : isTrue(d.showDiesel),
        );
        return list.length ? list : ['e5'];
    }

    private rows(fuel: Fuel, demo: boolean): Row[] {
        const d = this.state.rxData;
        const n = this.count();
        const rows: Row[] = [];
        if (demo) {
            DEMO.slice(0, n).forEach((s, i) =>
                rows.push({ i, name: d[`label${i + 1}`] || s.name, open: s.open, price: s[fuel] }),
            );
            return rows;
        }
        const base = this.base();
        const suf = this.suffixes();
        for (let i = 0; i < n; i++) {
            const g = (s: string): ioBroker.StateValue | undefined => this.state.st[`${base}.${i}.${s}`];
            const name = d[`label${i + 1}`] || GlashausWidget.ghText(g(suf.name));
            const status = g(suf.status);
            const price = toNum(g(suf[fuel]));
            if (!name && price === null) {
                continue;
            }
            const open =
                status === undefined || status === null || status === ''
                    ? true
                    : !['closed', 'false', '0', 'geschlossen', 'not found'].includes(String(status).toLowerCase());
            rows.push({ i, name: name || `#${i + 1}`, open, price: price && price > 0 ? price : null });
        }
        return rows;
    }

    /** "1,86⁹ €": the third decimal raised, like on the price boards */
    private static Price({ v, lang }: { v: number | null; lang: string }): React.JSX.Element {
        if (v === null) {
            return <span className="gh-fuel-p">–</span>;
        }
        const s = fmtNum(Math.floor(v * 1000 + 1e-6) / 1000, 3, lang);
        return (
            <span className="gh-fuel-p">
                {s.slice(0, -1)}
                <sup>{s.slice(-1)}</sup>
                <span className="eur">€</span>
            </span>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = !this.base();
        const fuels = this.fuels();
        const fuel =
            this.state.tab && fuels.includes(this.state.tab)
                ? this.state.tab
                : fuels.includes(d.fuel)
                  ? d.fuel
                  : fuels[0];
        const accent = this.ghAccent('', 'ok');
        let rows = this.rows(fuel, demo);
        if (isTrue(d.hideClosed)) {
            rows = rows.filter(r => r.open);
        }
        rows.sort((a, b) => {
            if (a.open !== b.open) {
                return a.open ? -1 : 1;
            }
            if (a.price === null || b.price === null) {
                return a.price === null ? 1 : -1;
            }
            return a.price - b.price;
        });
        const prices = rows.filter(r => r.open && r.price !== null).map(r => r.price!);
        const min = prices.length ? Math.min(...prices) : null;
        const max = prices.length ? Math.max(...prices) : null;
        const best = rows.find(r => r.open && r.price !== null && r.price === min);
        const cols = d.columns === '2' ? 2 : d.columns === '1' ? 1 : 0;
        const title = d.title || GlashausWidget.tr('fuel_default_title');

        return (
            <div
                className={this.ghClass('gh-fuel')}
                style={{ '--gh-c': accent } as React.CSSProperties}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                        <span className="gh-fuel-t">{title}</span>
                    </h2>
                    {fuels.length > 1 ? (
                        <div
                            className="gh-fuel-tabs"
                            role="tablist"
                        >
                            {fuels.map(f => (
                                <button
                                    key={f}
                                    type="button"
                                    role="tab"
                                    className="gh-outline"
                                    aria-pressed={f === fuel}
                                    aria-selected={f === fuel}
                                    onClick={() => this.setState({ tab: f })}
                                >
                                    {GlashausWidget.tr(`fuel_${f}_short`)}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <GhPill kind="idle">{GlashausWidget.tr(`fuel_${fuel}_short`)}</GhPill>
                    )}
                </div>
                {best ? (
                    <div className="gh-fuel-best">
                        <span className="gh-num">
                            <GlashausFuel.Price
                                v={best.price}
                                lang={lang}
                            />
                        </span>
                        <span className="gh-fuel-best-n">
                            <span className="gh-muted gh-small">{GlashausWidget.tr('fuel_cheapest')}</span>
                            <b>{best.name}</b>
                        </span>
                    </div>
                ) : null}
                {rows.length ? (
                    <ul
                        className={`gh-fuel-list${cols ? '' : ' auto'}`}
                        style={cols ? ({ '--gh-fuel-cols': cols } as React.CSSProperties) : undefined}
                    >
                        {rows.map(r => {
                            const w =
                                r.price === null || min === null || max === null
                                    ? 0
                                    : max === min
                                      ? 100
                                      : 28 + ((r.price - min) / (max - min)) * 72;
                            return (
                                <li
                                    key={r.i}
                                    className={`gh-fuel-li${r === best ? ' best' : ''}${r.open ? '' : ' closed'}`}
                                >
                                    <span className="gh-fuel-nm">
                                        {r.name}
                                        {r.open ? null : (
                                            <span className="gh-fuel-cl">{GlashausWidget.tr('fuel_closed')}</span>
                                        )}
                                    </span>
                                    <GlashausFuel.Price
                                        v={r.price}
                                        lang={lang}
                                    />
                                    <span className="gh-fuel-bar">
                                        <i style={{ width: `${r.open ? w : 0}%` }} />
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="gh-fuel-empty">{GlashausWidget.tr('no_data')}</div>
                )}
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

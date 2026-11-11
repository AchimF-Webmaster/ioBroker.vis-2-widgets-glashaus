/* Colour light: switch, brightness, white tone (colour temperature) and colour (hue/saturation or RGB hex),
 * plus preset swatches. Made for the ioBroker hue adapter (on, level 0…100, ct in Kelvin, hue 0…360, sat 0…100),
 * but generic: ranges, Kelvin or mired and an RGB hex ID (zigbee, deconz, wled …) are configurable.
 * Sliders write when the finger is lifted. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid } from './core/GlashausWidget';
import { GhIconBox } from './core/components';
import { clamp, fmtNum, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface LightRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    oidOn: string;
    oidLevel: string;
    levelMin: number | string;
    levelMax: number | string;
    oidCt: string;
    ctUnit: string;
    ctMin: number | string;
    ctMax: number | string;
    colorType: string;
    oidHue: string;
    hueMax: number | string;
    oidSat: string;
    satMax: number | string;
    oidRgb: string;
    presets: string;
    oidColormode: string;
    oidReachable: string;
}

type Kind = 'lvl' | 'ct' | 'hue' | 'sat';
type Mode = 'white' | 'color';

interface Demo {
    on: boolean;
    lvl: number;
    mode: Mode;
    ct: number;
    hue: number;
    sat: number;
}

interface LightState extends VisRxWidgetState {
    /** Slider being dragged and its position 0…1 */
    drag: { kind: Kind; v: number } | null;
    /** Values written last (normalised), shown until the state comes back */
    hold: Partial<Record<Kind, number>> & { on?: boolean; mode?: Mode };
    /** Tab chosen by the user (null: follows the lamp) */
    tab: Mode | null;
    demo: Demo;
}

const isRgb = (data: Record<string, any>): boolean => data.colorType === 'rgb';

const CSS = `
.gh.gh-li{container:gh-li/size;user-select:none;-webkit-user-select:none}
.gh-li .gh-h{flex-wrap:nowrap;margin-bottom:8px}
.gh-li-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-li .gh-ico{transition:background .45s,color .45s,box-shadow .45s}
.gh-li.gh-li-lit .gh-ico{background:var(--gh-li-c);color:var(--gh-fg);
  box-shadow:0 0 0 6px color-mix(in srgb,var(--gh-li-c) 26%,transparent),0 8px 26px -4px var(--gh-li-c)}
.gh-dark.gh-li.gh-li-lit .gh-ico{color:var(--gh-bg)}
.gh-li .gh-toggle[aria-checked='true']{background:var(--gh-li-c)}
.gh-li-top{display:flex;align-items:baseline;gap:10px;min-width:0;margin-bottom:12px}
.gh-li-num{font-size:40px;line-height:1;transition:opacity .45s}
.gh-li-off .gh-li-num{opacity:.35}
.gh-li-word{font-size:20px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gh-li-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}
.gh-li-row{display:flex;align-items:center;gap:10px}
.gh-li-lb{font-size:12px;color:var(--gh-fg-2);width:62px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-li-trk{--k:26px;position:relative;flex:1;min-width:0;height:var(--k);border-radius:99px;cursor:pointer;touch-action:none;
  background:var(--gh-track);box-shadow:inset 0 0 0 1px var(--gh-edge),inset 0 1px 2px var(--gh-edge);outline-offset:3px}
.gh-li-edit .gh-li-trk{cursor:default}
.gh-li-trk:focus-visible{outline:2px solid var(--gh-fg)}
.gh-li-fill{position:absolute;left:0;top:0;bottom:0;min-width:var(--k);border-radius:99px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--gh-li-c) 55%,transparent),var(--gh-li-c));transition:width .35s var(--gh-ease)}
.gh-li-off .gh-li-fill{background:color-mix(in srgb,var(--gh-fg) 22%,transparent)}
.gh-li-knob{position:absolute;top:3px;width:calc(var(--k) - 6px);height:calc(var(--k) - 6px);border-radius:50%;
  background:var(--gh-li-kc,var(--gh-knob));box-shadow:0 0 0 2.5px var(--gh-knob),0 1px 5px rgba(0,0,0,.35);
  transform:translateX(-50%);transition:left .35s var(--gh-ease)}
.gh-li-fill .gh-li-knob{left:auto;right:3px;transform:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.gh-li-drag .gh-li-fill,.gh-li-drag .gh-li-knob{transition:none}
.gh-li-tabs{display:flex;gap:6px}
.gh-li-tabs .gh-outline{height:28px;padding:0 12px;font-size:12.5px}
.gh-li-sw{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.gh-li-dot{width:28px;height:28px;border-radius:50%;padding:0;cursor:pointer;flex:none;
  border:1px solid color-mix(in srgb,var(--gh-fg) 18%,transparent);box-shadow:inset 0 0 0 2px var(--gh-bg);
  transition:transform .3s var(--gh-spring)}
.gh-li-dot:hover{transform:scale(1.12)}
.gh-li-dot[aria-pressed='true']{border:2px solid var(--gh-fg)}
@container gh-li (max-width:300px){.gh-li-lb{display:none}.gh-li-num{font-size:32px}.gh-li-word{font-size:17px}}
@container gh-li (max-height:272px){.gh-li-sw{display:none}}
@container gh-li (max-height:250px){.gh-li-top{margin-bottom:6px}.gh-li-num{font-size:30px}.gh-li-word{font-size:16px}.gh-li-body{gap:9px}.gh-li-trk{--k:22px}}
@container gh-li (max-height:212px){.gh-li-tabs{display:none}.gh-li-sat{display:none}}
@container gh-li (max-height:150px){.gh-li-col{display:none}}
@container gh-li (max-height:95px){.gh-li-top{display:none}}
@media (prefers-reduced-motion:reduce){.gh-li-fill,.gh-li-knob,.gh-li-dot{transition:none}}
`;

/* ---------- colour helpers ---------- */

const hex2 = (n: number): string =>
    Math.round(clamp(n, 0, 255))
        .toString(16)
        .padStart(2, '0');

/** HSV (h 0…360, s 0…100, v = 1) → #rrggbb */
export function hsToHex(h: number, s: number): string {
    const sat = clamp(s, 0, 100) / 100;
    const f = (n: number): number => {
        const k = (n + (((h % 360) + 360) % 360) / 60) % 6;
        return 255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1)));
    };
    return `#${hex2(f(5))}${hex2(f(3))}${hex2(f(1))}`;
}

/** #rrggbb (or rrggbb, #rgb) → hue 0…360 and saturation 0…100, null if not a colour */
export function hexToHs(v: unknown): { h: number; s: number } | null {
    if (typeof v !== 'string') {
        return null;
    }
    let t = v.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(t)) {
        t = t
            .split('')
            .map(c => c + c)
            .join('');
    }
    if (!/^[0-9a-f]{6}/i.test(t)) {
        return null;
    }
    const r = parseInt(t.slice(0, 2), 16) / 255;
    const g = parseInt(t.slice(2, 4), 16) / 255;
    const b = parseInt(t.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d > 0) {
        if (max === r) {
            h = 60 * (((g - b) / d) % 6);
        } else if (max === g) {
            h = 60 * ((b - r) / d + 2);
        } else {
            h = 60 * ((r - g) / d + 4);
        }
    }
    return { h: (h + 360) % 360, s: max > 0 ? (d / max) * 100 : 0 };
}

/** Colour temperature in Kelvin → #rrggbb (approximation after Tanner Helland) */
export function kelvinToHex(k: number): string {
    const t = clamp(k, 1000, 40000) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

interface Preset {
    mode: Mode;
    ct?: number;
    h?: number;
    s?: number;
    css: string;
}

/** "2700K, 4000K, #ff8a3d" → presets */
function parsePresets(text: unknown): Preset[] {
    const s = typeof text === 'string' ? text : '';
    const out: Preset[] = [];
    for (const raw of s.split(/[,;]/)) {
        const p = raw.trim();
        const k = /^(\d{3,5})\s*k$/i.exec(p);
        if (k) {
            const ct = Number(k[1]);
            out.push({ mode: 'white', ct, css: kelvinToHex(ct) });
            continue;
        }
        const hs = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(p) ? hexToHs(p) : null;
        if (hs) {
            out.push({ mode: 'color', h: hs.h, s: hs.s, css: hsToHex(hs.h, hs.s) });
        }
    }
    return out.slice(0, 8);
}

/** Range from two attributes with defaults (never empty) */
function rng(min: unknown, max: unknown, dmin: number, dmax: number): [number, number] {
    const a = toNum(min) ?? dmin;
    const b = toNum(max) ?? dmax;
    return a === b ? [dmin, dmax] : [a, b];
}

/** Pointer position on a slider track, 0…1 */
function posAt(e: React.PointerEvent<HTMLDivElement>): number {
    const r = e.currentTarget.getBoundingClientRect();
    return r.width > 0 ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0;
}

function ctWord(k: number): string {
    return GlashausWidget.tr(k < 3300 ? 'li_warm' : k < 5000 ? 'li_neutral' : 'li_daylight');
}

function hueWord(h: number, s: number): string {
    if (s < 15) {
        return GlashausWidget.tr('li_c_white');
    }
    const names = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink', 'red'];
    const edges = [15, 45, 70, 160, 200, 255, 290, 340, 361];
    const i = edges.findIndex(e => h < e);
    return GlashausWidget.tr(`li_c_${names[i < 0 ? 0 : i]}`);
}

const DEMO: Demo = { on: true, lvl: 72, mode: 'white', ct: 2900, hue: 28, sat: 80 };

export default class GlashausLight extends GlashausWidget<LightRxData, LightState> {
    private holdTimer: ReturnType<typeof setTimeout> | undefined;

    private keyTimer: ReturnType<typeof setTimeout> | undefined;

    /** Slider value chosen with the keys, written a moment after the last key */
    private keyPending: { kind: Kind; v: number } | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('light', CSS);
        this.state = { ...this.state, drag: null, hold: {}, tab: null, demo: { ...DEMO } };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausLight',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Light',
            visWidgetLabel: 'li_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('bulb'),
                        ...GlashausWidget.accentFields('', 'sun'),
                        { name: 'oidOn', label: 'li_oid_on', type: 'id', tooltip: 'li_oid_on_tip' },
                        { name: 'oidLevel', label: 'li_oid_level', type: 'id', tooltip: 'li_oid_level_tip' },
                        {
                            name: 'levelMin',
                            label: 'li_level_min',
                            type: 'number',
                            default: 0,
                            hidden: (data: WidgetData) => !isOid(data.oidLevel),
                        },
                        {
                            name: 'levelMax',
                            label: 'li_level_max',
                            type: 'number',
                            default: 100,
                            tooltip: 'li_level_max_tip',
                            hidden: (data: WidgetData) => !isOid(data.oidLevel),
                        },
                    ],
                },
                {
                    name: 'li_white',
                    label: 'group_li_white',
                    fields: [
                        { name: 'oidCt', label: 'li_oid_ct', type: 'id', tooltip: 'li_oid_ct_tip' },
                        {
                            name: 'ctUnit',
                            label: 'li_ct_unit',
                            type: 'select',
                            options: [
                                { value: 'kelvin', label: 'li_kelvin' },
                                { value: 'mired', label: 'li_mired' },
                            ],
                            default: 'kelvin',
                        },
                        { name: 'ctMin', label: 'li_ct_min', type: 'number', default: 2200 },
                        { name: 'ctMax', label: 'li_ct_max', type: 'number', default: 6500 },
                    ],
                },
                {
                    name: 'li_color',
                    label: 'group_li_color',
                    fields: [
                        {
                            name: 'colorType',
                            label: 'li_color_type',
                            type: 'select',
                            options: [
                                { value: 'hs', label: 'li_type_hs' },
                                { value: 'rgb', label: 'li_type_rgb' },
                            ],
                            default: 'hs',
                        },
                        {
                            name: 'oidHue',
                            label: 'li_oid_hue',
                            type: 'id',
                            tooltip: 'li_oid_hue_tip',
                            hidden: isRgb,
                        },
                        { name: 'hueMax', label: 'li_hue_max', type: 'number', default: 360, hidden: isRgb },
                        {
                            name: 'oidSat',
                            label: 'li_oid_sat',
                            type: 'id',
                            tooltip: 'li_oid_sat_tip',
                            hidden: isRgb,
                        },
                        { name: 'satMax', label: 'li_sat_max', type: 'number', default: 100, hidden: isRgb },
                        {
                            name: 'oidRgb',
                            label: 'li_oid_rgb',
                            type: 'id',
                            tooltip: 'li_oid_rgb_tip',
                            hidden: (data: WidgetData) => !isRgb(data),
                        },
                    ],
                },
                {
                    name: 'li_more',
                    label: 'group_li_more',
                    fields: [
                        {
                            name: 'presets',
                            label: 'li_presets',
                            default: '2700K,4000K,6000K,#ff8a3d,#e8475f,#8a5cff,#2f80ff,#2bb3a3',
                            tooltip: 'li_presets_tip',
                        },
                        {
                            name: 'oidColormode',
                            label: 'li_oid_colormode',
                            type: 'id',
                            tooltip: 'li_oid_colormode_tip',
                        },
                        {
                            name: 'oidReachable',
                            label: 'li_oid_reachable',
                            type: 'id',
                            tooltip: 'li_oid_reachable_tip',
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 360, height: 360, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_light.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausLight.getWidgetInfo();
    }

    componentWillUnmount(): void {
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
        }
        if (this.keyTimer) {
            clearTimeout(this.keyTimer);
            // a value chosen with the keys must not get lost
            if (this.keyPending) {
                this.commit(this.keyPending.kind, this.keyPending.v);
            }
        }
        super.componentWillUnmount();
    }

    /* ---------- configuration ---------- */

    private isDemo(): boolean {
        const d = this.state.rxData;
        return ![d.oidOn, d.oidLevel, d.oidCt, d.oidHue, d.oidSat, d.oidRgb].some(isOid);
    }

    private hasLevel(): boolean {
        return this.isDemo() || isOid(this.state.rxData.oidLevel);
    }

    private hasCt(): boolean {
        return this.isDemo() || isOid(this.state.rxData.oidCt);
    }

    private hasColor(): boolean {
        const d = this.state.rxData;
        return this.isDemo() || (isRgb(d) ? isOid(d.oidRgb) : isOid(d.oidHue));
    }

    private hasSat(): boolean {
        const d = this.state.rxData;
        return this.isDemo() || (isRgb(d) ? isOid(d.oidRgb) : isOid(d.oidSat));
    }

    private ctRange(): [number, number] {
        const d = this.state.rxData;
        const [a, b] = rng(d.ctMin, d.ctMax, 2200, 6500);
        return [Math.min(a, b), Math.max(a, b)];
    }

    /* ---------- reading (normalised: level %, ct K, hue °, sat %) ---------- */

    private readOn(): boolean | null {
        const d = this.state.rxData;
        if (this.state.hold.on !== undefined) {
            return this.state.hold.on;
        }
        if (this.isDemo()) {
            return this.state.demo.on;
        }
        if (isOid(d.oidOn)) {
            const v = this.ghVal(d.oidOn);
            return v === undefined || v === null ? null : toBool(v);
        }
        const l = this.readLevel();
        return l === null ? null : l > 0;
    }

    private readLevel(): number | null {
        const d = this.state.rxData;
        if (this.state.hold.lvl !== undefined) {
            return this.state.hold.lvl;
        }
        if (this.isDemo()) {
            return this.state.demo.lvl;
        }
        const raw = toNum(this.ghVal(d.oidLevel));
        if (raw === null) {
            return null;
        }
        const [min, max] = rng(d.levelMin, d.levelMax, 0, 100);
        return clamp(((raw - min) / (max - min)) * 100, 0, 100);
    }

    private readCt(): number | null {
        const d = this.state.rxData;
        if (this.state.hold.ct !== undefined) {
            return this.state.hold.ct;
        }
        if (this.isDemo()) {
            return this.state.demo.ct;
        }
        const raw = toNum(this.ghVal(d.oidCt));
        if (raw === null || raw <= 0) {
            return null;
        }
        return d.ctUnit === 'mired' ? 1e6 / raw : raw;
    }

    private readHs(): { h: number | null; s: number | null } {
        const d = this.state.rxData;
        const hold = this.state.hold;
        if (this.isDemo()) {
            return { h: hold.hue ?? this.state.demo.hue, s: hold.sat ?? this.state.demo.sat };
        }
        if (isRgb(d)) {
            const hs = hexToHs(this.ghVal(d.oidRgb));
            return { h: hold.hue ?? hs?.h ?? null, s: hold.sat ?? hs?.s ?? null };
        }
        const h = toNum(this.ghVal(d.oidHue));
        const s = toNum(this.ghVal(d.oidSat));
        const hMax = toNum(d.hueMax) || 360;
        const sMax = toNum(d.satMax) || 100;
        return {
            h: hold.hue ?? (h === null ? null : (h / hMax) * 360),
            s: hold.sat ?? (s === null ? null : clamp((s / sMax) * 100, 0, 100)),
        };
    }

    /** White or colour: colormode ID, else the ID changed last, else the saturation */
    private readMode(): Mode {
        const d = this.state.rxData;
        if (this.state.hold.mode) {
            return this.state.hold.mode;
        }
        if (this.isDemo()) {
            return this.state.demo.mode;
        }
        if (!this.hasColor()) {
            return 'white';
        }
        if (!this.hasCt()) {
            return 'color';
        }
        if (isOid(d.oidColormode)) {
            const m = String(this.ghVal(d.oidColormode) ?? '').toLowerCase();
            if (m === 'ct') {
                return 'white';
            }
            if (m === 'hs' || m === 'xy' || m === 'rgb' || m === 'color') {
                return 'color';
            }
        }
        const lcCt = this.ghLc(d.oidCt) ?? 0;
        const lcCol = Math.max(
            this.ghLc(isRgb(d) ? d.oidRgb : d.oidHue) ?? 0,
            isRgb(d) ? 0 : (this.ghLc(d.oidSat) ?? 0),
        );
        if (lcCt !== lcCol && (lcCt || lcCol)) {
            return lcCol > lcCt ? 'color' : 'white';
        }
        const { s } = this.readHs();
        return s !== null && s > 20 ? 'color' : 'white';
    }

    /* ---------- writing ---------- */

    private hold(patch: LightState['hold'], demo?: Partial<Demo>): void {
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
        }
        if (demo) {
            this.setState({ demo: { ...this.state.demo, ...demo } });
            return;
        }
        this.setState({ hold: { ...this.state.hold, ...patch } });
        // the lamp answers within a second or two; afterwards the real states count again
        this.holdTimer = setTimeout(() => this.setState({ hold: {} }), 4000);
    }

    /** Switches on together with a brightness/colour change */
    private ensureOn(): void {
        const d = this.state.rxData;
        if (this.readOn() !== true && isOid(d.oidOn)) {
            this.ghSet(d.oidOn, true);
        }
    }

    private toggle(): void {
        if (this.props.editMode) {
            return;
        }
        const d = this.state.rxData;
        const on = !(this.readOn() ?? false);
        if (this.isDemo()) {
            this.hold({}, { on });
            return;
        }
        if (isOid(d.oidOn)) {
            this.ghSet(d.oidOn, on);
        } else if (isOid(d.oidLevel)) {
            const [min, max] = rng(d.levelMin, d.levelMax, 0, 100);
            this.ghSet(d.oidLevel, on ? max : min);
        }
        this.hold({ on });
    }

    /** Writes a slider value (v 0…1) */
    private commit(kind: Kind, v: number): void {
        if (this.props.editMode) {
            return;
        }
        const d = this.state.rxData;
        const demo = this.isDemo();
        if (kind === 'lvl') {
            const pct = Math.max(1, Math.round(v * 100));
            if (demo) {
                this.hold({}, { lvl: pct, on: true });
                return;
            }
            const [min, max] = rng(d.levelMin, d.levelMax, 0, 100);
            this.ensureOn();
            this.ghSet(d.oidLevel, Math.round(min + (pct / 100) * (max - min)));
            this.hold({ lvl: pct, on: true });
            return;
        }
        if (kind === 'ct') {
            const [a, b] = this.ctRange();
            const k = Math.round((a + v * (b - a)) / 50) * 50;
            this.writeWhite(k);
            return;
        }
        const cur = this.readHs();
        const h = kind === 'hue' ? Math.round(v * 360) % 360 : (cur.h ?? 0);
        const s = kind === 'sat' ? Math.round(v * 100) : (cur.s ?? 100);
        this.writeColor(h, s, kind);
    }

    private writeWhite(k: number): void {
        const d = this.state.rxData;
        if (this.isDemo()) {
            this.hold({}, { ct: k, mode: 'white', on: true });
            return;
        }
        this.ensureOn();
        this.ghSet(d.oidCt, d.ctUnit === 'mired' ? Math.round(1e6 / k) : k);
        this.hold({ ct: k, mode: 'white', on: true });
    }

    private writeColor(h: number, s: number, only?: Kind): void {
        const d = this.state.rxData;
        if (this.isDemo()) {
            this.hold({}, { hue: h, sat: s, mode: 'color', on: true });
            return;
        }
        this.ensureOn();
        if (isRgb(d)) {
            this.ghSet(d.oidRgb, hsToHex(h, s));
        } else {
            const hMax = toNum(d.hueMax) || 360;
            const sMax = toNum(d.satMax) || 100;
            if (only !== 'sat') {
                this.ghSet(d.oidHue, Math.round((h / 360) * hMax));
            }
            if (only !== 'hue' && isOid(d.oidSat)) {
                this.ghSet(d.oidSat, Math.round((s / 100) * sMax));
            }
        }
        this.hold({ hue: h, sat: s, mode: 'color', on: true });
    }

    private applyPreset(p: Preset): void {
        if (this.props.editMode) {
            return;
        }
        this.setState({ tab: p.mode });
        if (p.mode === 'white' && p.ct !== undefined) {
            if (this.hasCt()) {
                this.writeWhite(p.ct);
            }
        } else if (p.h !== undefined && this.hasColor()) {
            this.writeColor(p.h, p.s ?? 100);
        }
    }

    /* ---------- slider gestures ---------- */

    private liDown(kind: Kind, e: React.PointerEvent<HTMLDivElement>): void {
        if (this.props.editMode || e.button > 0) {
            return;
        }
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        this.setState({ drag: { kind, v: posAt(e) } });
    }

    private liMove(e: React.PointerEvent<HTMLDivElement>): void {
        const dr = this.state.drag;
        if (dr) {
            this.setState({ drag: { kind: dr.kind, v: posAt(e) } });
        }
    }

    private liUp(e: React.PointerEvent<HTMLDivElement>): void {
        const dr = this.state.drag;
        if (!dr) {
            return;
        }
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        const v = posAt(e);
        this.setState({ drag: null });
        this.commit(dr.kind, v);
    }

    private liKey(kind: Kind, cur: number, e: React.KeyboardEvent): void {
        if (this.props.editMode) {
            return;
        }
        const step =
            e.key === 'ArrowRight' || e.key === 'ArrowUp'
                ? 0.05
                : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                  ? -0.05
                  : 0;
        if (!step) {
            return;
        }
        e.preventDefault();
        const base = this.keyPending?.kind === kind ? this.keyPending.v : cur;
        const v = clamp(base + step, 0, 1);
        this.keyPending = { kind, v };
        this.setState({ drag: { kind, v } });
        if (this.keyTimer) {
            clearTimeout(this.keyTimer);
        }
        this.keyTimer = setTimeout(() => {
            this.keyTimer = undefined;
            const p = this.keyPending;
            this.keyPending = null;
            this.setState({ drag: null });
            if (p) {
                this.commit(p.kind, p.v);
            }
        }, 600);
    }

    private renderSlider(
        kind: Kind,
        label: string,
        value: number | null,
        opts: { track?: string; knob?: string; fill?: boolean; text?: string; cls?: string },
    ): React.JSX.Element {
        const dr = this.state.drag;
        const v = dr?.kind === kind ? dr.v : (value ?? 0);
        const pct = `${(v * 100).toFixed(1)}%`;
        return (
            <div className={`gh-li-row ${opts.cls || ''}`}>
                <span className="gh-li-lb">{label}</span>
                <div
                    className={`gh-li-trk${dr?.kind === kind ? ' gh-li-drag' : ''}`}
                    style={opts.track ? { background: opts.track } : undefined}
                    role="slider"
                    tabIndex={0}
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(v * 100)}
                    aria-valuetext={opts.text}
                    onPointerDown={e => this.liDown(kind, e)}
                    onPointerMove={e => this.liMove(e)}
                    onPointerUp={e => this.liUp(e)}
                    onPointerCancel={() => this.setState({ drag: null })}
                    onKeyDown={e => this.liKey(kind, v, e)}
                >
                    {opts.fill ? (
                        <div
                            className="gh-li-fill"
                            style={{ width: `max(var(--k), ${pct})` }}
                        >
                            <span className="gh-li-knob" />
                        </div>
                    ) : (
                        <span
                            className="gh-li-knob"
                            style={
                                {
                                    left: `clamp(calc(var(--k) / 2), ${pct}, calc(100% - var(--k) / 2))`,
                                    '--gh-li-kc': opts.knob,
                                } as React.CSSProperties
                            }
                        />
                    )}
                </div>
            </div>
        );
    }

    /* ---------- render ---------- */

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const accent = this.ghAccent('', 'sun');
        const on = this.readOn();
        const lvl = this.readLevel();
        const ct = this.readCt();
        const { h, s } = this.readHs();
        const mode = this.readMode();
        const tab: Mode = this.state.tab ?? mode;
        const reachable = isOid(d.oidReachable) ? toBool(this.ghVal(d.oidReachable) ?? true) : true;
        const [ctA, ctB] = this.ctRange();
        const title = d.title || GlashausWidget.tr('li_default_title');

        // the colour the lamp shows right now
        let lampCss = accent;
        if (mode === 'color' && h !== null) {
            lampCss = hsToHex(h, s ?? 100);
        } else if (ct !== null) {
            lampCss = kelvinToHex(ct);
        }
        const lit = on === true && reachable;

        let word = '';
        if (!reachable) {
            word = GlashausWidget.tr('li_unreachable');
        } else if (on === false) {
            word = GlashausWidget.tr('li_off');
        } else if (mode === 'color' && h !== null) {
            word = hueWord(h, s ?? 100);
        } else if (ct !== null) {
            word = ctWord(ct);
        } else if (on) {
            word = GlashausWidget.tr('li_on');
        }

        const showLevel = this.hasLevel();
        const showCt = this.hasCt();
        const showCol = this.hasColor();
        const dragLvl = this.state.drag?.kind === 'lvl' ? this.state.drag.v * 100 : null;
        const shownLvl = dragLvl ?? lvl;

        // track gradients (they show the light itself, so they are drawn in real colours)
        const ctStops = [0, 0.25, 0.5, 0.75, 1].map(f => kelvinToHex(ctA + f * (ctB - ctA))).join(',');
        const hueNow = this.state.drag?.kind === 'hue' ? this.state.drag.v * 360 : (h ?? 0);
        const satNow = this.state.drag?.kind === 'sat' ? this.state.drag.v * 100 : (s ?? 100);
        const hueStops = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]
            .map(x => hsToHex(x, Math.max(satNow, 35)))
            .join(',');
        const ctNow = this.state.drag?.kind === 'ct' ? ctA + this.state.drag.v * (ctB - ctA) : ct;
        const presets = parsePresets(d.presets).filter(p => (p.mode === 'white' ? showCt : showCol));

        const cls = ['gh-li', lit ? 'gh-li-lit' : 'gh-li-off', this.props.editMode ? 'gh-li-edit' : ''].join(' ');

        return (
            <div
                className={this.ghClass(cls)}
                style={{ '--gh-c': accent, '--gh-li-c': lit ? lampCss : accent } as React.CSSProperties}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={lit ? lampCss : accent}
                        />
                        <span className="gh-li-t">{title}</span>
                    </h2>
                    <button
                        type="button"
                        className="gh-toggle"
                        role="switch"
                        aria-checked={on === true}
                        aria-label={title}
                        disabled={(!demo && !isOid(d.oidOn) && !isOid(d.oidLevel)) || !reachable}
                        onClick={() => this.toggle()}
                    />
                </div>
                <div className="gh-li-top">
                    {showLevel ? (
                        <span className="gh-num gh-li-num">
                            {shownLvl === null ? '–' : fmtNum(shownLvl, 0, lang)}
                            <span className="gh-unit">%</span>
                        </span>
                    ) : null}
                    <span className="gh-it gh-li-word">{word}</span>
                </div>
                <div className="gh-li-body">
                    {showLevel
                        ? this.renderSlider(
                              'lvl',
                              GlashausWidget.tr('li_brightness'),
                              lvl === null ? null : lvl / 100,
                              {
                                  fill: true,
                                  text: shownLvl === null ? undefined : `${Math.round(shownLvl)} %`,
                              },
                          )
                        : null}
                    {showCt && showCol ? (
                        <div className="gh-li-tabs">
                            {(['white', 'color'] as Mode[]).map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    className="gh-outline"
                                    aria-pressed={tab === m}
                                    onClick={() => this.setState({ tab: m })}
                                >
                                    {GlashausWidget.tr(m === 'white' ? 'li_tab_white' : 'li_tab_color')}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {showCt && (tab === 'white' || !showCol)
                        ? this.renderSlider(
                              'ct',
                              GlashausWidget.tr('li_white_tone'),
                              ct === null ? null : clamp((ct - ctA) / (ctB - ctA), 0, 1),
                              {
                                  track: `linear-gradient(90deg,${ctStops})`,
                                  knob: ctNow === null ? undefined : kelvinToHex(ctNow),
                                  text: ctNow === null ? undefined : `${Math.round(ctNow)} K`,
                                  cls: 'gh-li-col',
                              },
                          )
                        : null}
                    {showCol && (tab === 'color' || !showCt) ? (
                        <>
                            {this.renderSlider('hue', GlashausWidget.tr('li_hue'), h === null ? null : h / 360, {
                                track: `linear-gradient(90deg,${hueStops})`,
                                knob: hsToHex(hueNow, satNow),
                                text: `${Math.round(hueNow)}°`,
                                cls: 'gh-li-col',
                            })}
                            {this.hasSat()
                                ? this.renderSlider(
                                      'sat',
                                      GlashausWidget.tr('li_saturation'),
                                      s === null ? null : s / 100,
                                      {
                                          track: `linear-gradient(90deg,${hsToHex(hueNow, 0)},${hsToHex(hueNow, 100)})`,
                                          knob: hsToHex(hueNow, satNow),
                                          text: `${Math.round(satNow)} %`,
                                          cls: 'gh-li-col gh-li-sat',
                                      },
                                  )
                                : null}
                        </>
                    ) : null}
                    {presets.length ? (
                        <div className="gh-li-sw">
                            {presets.map((p, i) => {
                                const active =
                                    on === true &&
                                    p.mode === mode &&
                                    (p.mode === 'white'
                                        ? ct !== null && Math.abs(ct - (p.ct ?? 0)) < 120
                                        : h !== null &&
                                          Math.abs(((((h - (p.h ?? 0)) % 360) + 540) % 360) - 180) < 8 &&
                                          Math.abs((s ?? 100) - (p.s ?? 100)) < 10);
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        className="gh-li-dot"
                                        style={{ background: p.css }}
                                        aria-pressed={active}
                                        aria-label={p.mode === 'white' ? `${p.ct} K` : hueWord(p.h ?? 0, p.s ?? 100)}
                                        title={p.mode === 'white' ? `${p.ct} K` : hueWord(p.h ?? 0, p.s ?? 100)}
                                        onClick={() => this.applyPreset(p)}
                                    />
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

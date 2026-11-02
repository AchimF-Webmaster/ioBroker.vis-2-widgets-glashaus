/* Climate tile for air conditioners and heat pumps: power, operation mode, target temperature on a dial
 * with − / +, room and outdoor temperature, optional louvre swing, powerful mode and energy values.
 * Every write is optimistic: the tile shows the new value at once and keeps it until the device confirms it
 * (cloud devices often need several seconds). Without object IDs the tile works locally (demo). */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhPill } from './core/components';
import { clamp, fmtNum, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

type Mode = 'heat' | 'cool' | 'auto' | 'dry' | 'fan';
const MODES: Mode[] = ['heat', 'cool', 'auto', 'dry', 'fan'];
/** Modes without a target temperature */
const NO_SETPOINT: Mode[] = ['dry', 'fan'];
const MODE_ICON: Record<Mode, string> = { heat: 'flame', cool: 'snow', auto: 'thermo', dry: 'drop', fan: 'fan' };
const MODE_ACCENT: Record<Mode, string> = {
    heat: 'var(--gh-heat)',
    cool: 'var(--gh-cool)',
    auto: 'var(--gh-grid)',
    dry: 'var(--gh-teal)',
    fan: 'var(--gh-home)',
};
const MODE_DEFAULT: Record<Mode, string> = { heat: '1', cool: '2', auto: '3', dry: '4', fan: '0' };
const MODE_ATTR: Record<Mode, string> = { heat: 'Heat', cool: 'Cool', auto: 'Auto', dry: 'Dry', fan: 'Fan' };

/** How long an optimistic value is kept when the device does not answer */
const HOLD_MS = 20000;
/** − / + : the target is written this long after the last tap */
const SEND_MS = 900;

interface ClimateRxData {
    title: string;
    icon: string;
    iconCustom: string;
    oidPower: string;
    powerOn: string;
    powerOff: string;
    oidTarget: string;
    oidRoom: string;
    oidOutdoor: string;
    min: number | string;
    max: number | string;
    step: number | string;
    decimals: number | string;
    oidMode: string;
    valueHeat: string;
    valueCool: string;
    valueAuto: string;
    valueDry: string;
    valueFan: string;
    showHeat: boolean | string;
    showCool: boolean | string;
    showAuto: boolean | string;
    showDry: boolean | string;
    showFan: boolean | string;
    oidSwing: string;
    oidPowerful: string;
    oidEnergyToday: string;
    oidEnergyYear: string;
    energyUnit: string;
}

type OptKey = 'on' | 'mode' | 'target' | 'swing' | 'powerful';
interface Opt {
    on?: boolean;
    mode?: Mode;
    target?: number;
    swing?: boolean;
    powerful?: boolean;
}

interface ClimateState extends VisRxWidgetState {
    demo: { on: boolean; mode: Mode; target: number; swing: boolean; powerful: boolean };
    /** Optimistic values after a tap, until the device confirms them */
    opt: Opt;
}

const DEMO = { room: 21.4, outdoor: 7.5, today: 1.8, year: 412 };

const CSS = `
.gh.gh-cl{padding:0;container:gh-cl/size;user-select:none;-webkit-user-select:none}
.gh-cl-box{flex:1;min-height:0;display:flex;flex-direction:column;padding:20px 20px 18px;gap:12px}
.gh-cl .gh-h{flex-wrap:nowrap;margin:0}
.gh-cl .gh-title{flex:1 1 auto}
.gh-cl-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-cl-hr{display:flex;align-items:center;gap:10px;flex:none;min-width:0}
.gh-cl .gh-pill{max-width:120px}
.gh-cl .gh-ico{transition:background .45s,color .45s}
.gh-cl .gh-toggle[aria-checked='true']{background:var(--gh-c)}
.gh-cl-dial{flex:1 1 0;min-height:0;container:gh-cl-d/size;display:flex;justify-content:center}
.gh-cl-ring{position:relative;height:100%;width:min(100cqw,calc(100cqh * 200 / 168));max-height:calc(100cqw * 168 / 200);
  container:gh-cl-r/inline-size;margin:auto}
.gh-cl-ring>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.gh-cl-trk{fill:none;stroke:var(--gh-track);stroke-linecap:round}
.gh-cl-val{fill:none;stroke:var(--gh-c);stroke-linecap:round;transition:stroke-dasharray .6s var(--gh-ease),stroke .45s}
.gh-cl-off .gh-cl-val{stroke:var(--gh-fg-3)}
.gh-cl-dot{fill:var(--gh-fg);stroke:var(--gh-bg);stroke-width:2.2;transition:transform .6s var(--gh-ease)}
.gh-cl-mid{position:absolute;left:0;right:0;top:20%;display:flex;flex-direction:column;align-items:center;text-align:center}
.gh-cl-lbl{font-size:max(10px,6cqw);color:var(--gh-fg-2);letter-spacing:.1em;text-transform:uppercase;line-height:1.2}
.gh-cl-n{font-size:21cqw;line-height:1.02;white-space:nowrap;transition:color .45s}
.gh-cl-n .gh-unit{font-size:.4em;margin-left:2px}
.gh-cl-off .gh-cl-n{color:var(--gh-fg-2)}
.gh-cl-ns{font-size:max(10px,6.4cqw);color:var(--gh-fg-3);line-height:1.3}
.gh-cl-sub{font-size:max(11px,6.4cqw);color:var(--gh-fg-2);white-space:nowrap;font-variant-numeric:tabular-nums;margin-top:2px}
.gh-cl-pm{position:absolute;bottom:0;width:max(34px,19cqw);height:max(34px,19cqw)}
.gh-cl-pm svg{width:45%;height:45%}
.gh-cl-pm.m{left:2%}
.gh-cl-pm.p{right:2%}
.gh-cl .gh-circ:disabled{opacity:.35;cursor:default;background:transparent;color:inherit}
.gh-cl-edit .gh-circ,.gh-cl-edit button{cursor:default}
.gh-cl-modes{display:flex;gap:6px;flex:none;min-width:0}
.gh-cl-m{flex:1 1 0;min-width:0;height:38px;border:0;border-radius:99px;cursor:pointer;display:flex;align-items:center;
  justify-content:center;gap:6px;padding:0 8px;background:var(--gh-track);color:var(--gh-fg-2);font-size:13px;font-weight:550;
  transition:background .35s var(--gh-ease),color .35s,box-shadow .35s}
.gh-cl-m svg{width:17px;height:17px;flex:none}
.gh-cl-m span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-cl-m[aria-pressed='true']{background:var(--gh-c);color:var(--gh-bg);box-shadow:0 6px 18px -8px var(--gh-c)}
.gh-cl-off .gh-cl-m[aria-pressed='true']{background:color-mix(in srgb,var(--gh-c) 22%,transparent);color:var(--gh-fg);box-shadow:none}
.gh-cl-ft{display:flex;align-items:center;gap:8px;flex:none;min-width:0}
.gh-cl-ft .gh-outline{height:32px;padding:0 12px;font-size:12.5px;flex:none}
.gh-cl-ft .gh-outline svg{width:16px;height:16px}
/* one line only: values that do not fit wrap into the hidden second line */
.gh-cl-kv{margin-left:auto;flex:1 1 0;display:flex;flex-wrap:wrap;justify-content:flex-end;column-gap:12px;height:19px;line-height:19px;
  overflow:hidden;font-size:12.5px;color:var(--gh-fg-2);white-space:nowrap;min-width:0}
.gh-cl-kv b{font-weight:550;color:var(--gh-fg);font-variant-numeric:tabular-nums}
/* not enough room for five labels: only the active mode keeps its label */
@container gh-cl (max-width:470px){
  .gh-cl-m:not([aria-pressed='true']) span{display:none}
  .gh-cl-m[aria-pressed='true']{flex-grow:2.4}
}
@container gh-cl (max-width:300px){
  .gh-cl-m span{display:none}
  .gh-cl-m[aria-pressed='true']{flex-grow:1}
}
@container gh-cl (max-width:260px){
  .gh-cl-box{padding:14px 14px 12px;gap:10px}
  .gh-cl .gh-pill{display:none}
  .gh-cl .gh-ico{width:28px;height:28px;border-radius:9px}
  .gh-cl .gh-ico svg{width:16px;height:16px}
  .gh-cl-ft .gh-outline span{display:none}
  .gh-cl-ft .gh-outline{width:32px;padding:0;justify-content:center}
  .gh-cl-m{height:32px;padding:0 4px}
}
@container gh-cl (max-height:300px){
  .gh-cl-ft{display:none}
}
@container gh-cl (max-height:230px){
  .gh-cl-box{padding:14px 16px 12px;gap:8px}
  .gh-cl-m{height:32px}
  .gh-cl .gh-ico{width:28px;height:28px;border-radius:9px}
  .gh-cl .gh-ico svg{width:16px;height:16px}
}
@container gh-cl (max-height:170px){
  .gh-cl-modes{display:none}
}
`;

/** Attribute text → state value: 'true'/'false' → boolean, numeric text → number, else the text */
function parseValue(v: unknown, def: ioBroker.StateValue): ioBroker.StateValue {
    if (v === undefined || v === null || v === '') {
        return def;
    }
    if (typeof v === 'boolean' || typeof v === 'number') {
        return v;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) {
        return def;
    }
    if (s === 'true' || s === 'false') {
        return s === 'true';
    }
    if (/^-?\d+([.,]\d+)?$/.test(s)) {
        return Number(s.replace(',', '.'));
    }
    return s;
}

/** Loose comparison of a state value with a configured value */
function sameValue(a: unknown, b: ioBroker.StateValue): boolean {
    if (a === undefined || a === null) {
        return false;
    }
    if (typeof b === 'boolean') {
        return typeof a === 'boolean' ? a === b : toBool(a) === b;
    }
    if (typeof b === 'number') {
        const n = toNum(a);
        return n !== null && n === b;
    }
    const t = typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' ? String(a) : '';
    return t.trim().toLowerCase() === String(b).trim().toLowerCase();
}

/* Dial: 240° arc, open at the bottom; viewBox 200 × 168, centre (100, 92), radius 78 */
const CX = 100;
const CY = 92;
const R = 78;
const A0 = 150;
const SWEEP = 240;
function pt(angle: number): [number, number] {
    const a = (angle * Math.PI) / 180;
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}
const [SX, SY] = pt(A0);
const [EX, EY] = pt(A0 + SWEEP);
const ARC = `M${SX.toFixed(2)} ${SY.toFixed(2)} A${R} ${R} 0 1 1 ${EX.toFixed(2)} ${EY.toFixed(2)}`;

export default class GlashausClimate extends GlashausWidget<ClimateRxData, ClimateState> {
    private holdTimers: Partial<Record<OptKey, ReturnType<typeof setTimeout>>> = {};

    private sendTimer: ReturnType<typeof setTimeout> | undefined;

    /** Target that still has to be written (written on unmount, too) */
    private pendingTarget: number | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('climate', CSS);
        this.state = {
            ...this.state,
            demo: { on: true, mode: 'heat', target: 22.5, swing: false, powerful: false },
            opt: {},
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const modeFields: RxWidgetInfoAttributesField[] = [];
        for (const m of MODES) {
            modeFields.push({
                name: `show${MODE_ATTR[m]}`,
                label: `cl_show_${m}`,
                type: 'checkbox',
                default: true,
            });
            modeFields.push({
                name: `value${MODE_ATTR[m]}`,
                label: `cl_value_${m}`,
                default: MODE_DEFAULT[m],
                hidden: `!data["show${MODE_ATTR[m]}"] && data["show${MODE_ATTR[m]}"] !== undefined`,
            });
        }
        return {
            id: 'tplGlashausClimate',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus_klima',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Climate',
            visWidgetLabel: 'climate_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('aircon'),
                        { name: 'oidPower', label: 'cl_oid_power', type: 'id', tooltip: 'cl_oid_power_tip' },
                        {
                            name: 'powerOn',
                            label: 'sw_value_on',
                            default: 'true',
                            hidden: (data: WidgetData) => !isOid(data.oidPower),
                        },
                        {
                            name: 'powerOff',
                            label: 'sw_value_off',
                            default: 'false',
                            hidden: (data: WidgetData) => !isOid(data.oidPower),
                        },
                        { name: 'oidTarget', label: 'cl_oid_target', type: 'id', tooltip: 'cl_oid_target_tip' },
                        { name: 'oidRoom', label: 'cl_oid_room', type: 'id' },
                        { name: 'oidOutdoor', label: 'cl_oid_outdoor', type: 'id' },
                        { name: 'min', label: 'cl_min', type: 'number', default: 16 },
                        { name: 'max', label: 'cl_max', type: 'number', default: 30 },
                        { name: 'step', label: 'cl_step', type: 'number', default: 0.5 },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 2, default: 1 },
                    ],
                },
                {
                    name: 'modes',
                    label: 'group_cl_modes',
                    fields: [
                        { name: 'oidMode', label: 'cl_oid_mode', type: 'id', tooltip: 'cl_oid_mode_tip' },
                        ...modeFields,
                    ],
                },
                {
                    name: 'extras',
                    label: 'group_cl_extras',
                    fields: [
                        { name: 'oidSwing', label: 'cl_oid_swing', type: 'id', tooltip: 'cl_oid_swing_tip' },
                        { name: 'oidPowerful', label: 'cl_oid_powerful', type: 'id' },
                        { name: 'oidEnergyToday', label: 'cl_oid_energy_today', type: 'id' },
                        { name: 'oidEnergyYear', label: 'cl_oid_energy_year', type: 'id' },
                        { name: 'energyUnit', label: 'unit', default: 'kWh' },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 380, height: 360, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_climate.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausClimate.getWidgetInfo();
    }

    componentWillUnmount(): void {
        Object.values(this.holdTimers).forEach(t => t && clearTimeout(t));
        this.holdTimers = {};
        if (this.sendTimer) {
            clearTimeout(this.sendTimer);
            this.sendTimer = undefined;
        }
        // a target chosen with − / + must not get lost
        if (this.pendingTarget !== null) {
            this.ghSet(this.state.rxData.oidTarget, this.pendingTarget);
            this.pendingTarget = null;
        }
        super.componentWillUnmount();
    }

    onStateUpdated(id: string, state: ioBroker.State): void {
        super.onStateUpdated(id, state);
        const d = this.state.rxData;
        const val = state?.val;
        const o = this.state.opt;
        // drop an optimistic value as soon as the device reports it
        if (o.on !== undefined && id === d.oidPower && this.powerOf(val) === o.on) {
            this.release('on');
        }
        if (o.mode !== undefined && id === d.oidMode && this.modeOf(val) === o.mode) {
            this.release('mode');
        }
        const n = toNum(val);
        if (
            o.target !== undefined &&
            id === d.oidTarget &&
            !this.sendTimer &&
            n !== null &&
            Math.abs(n - o.target) < 0.01
        ) {
            this.release('target');
        }
        if (o.swing !== undefined && id === d.oidSwing && toBool(val) === o.swing) {
            this.release('swing');
        }
        if (o.powerful !== undefined && id === d.oidPowerful && toBool(val) === o.powerful) {
            this.release('powerful');
        }
    }

    private setOpt(k: OptKey, value: Opt[OptKey] | undefined): void {
        this.setState(prev => {
            const opt: Opt = { ...prev.opt };
            if (value === undefined) {
                delete opt[k];
            } else {
                (opt as Record<OptKey, unknown>)[k] = value;
            }
            return { opt };
        });
    }

    private release(k: OptKey): void {
        const t = this.holdTimers[k];
        if (t) {
            clearTimeout(t);
            delete this.holdTimers[k];
        }
        this.setOpt(k, undefined);
    }

    private hold<K extends OptKey>(k: K, value: Opt[K]): void {
        const t = this.holdTimers[k];
        if (t) {
            clearTimeout(t);
        }
        this.holdTimers[k] = setTimeout(() => {
            delete this.holdTimers[k];
            this.setOpt(k, undefined);
        }, HOLD_MS);
        this.setOpt(k, value);
    }

    /* ---------- reading ---------- */

    private isDemo(): boolean {
        const d = this.state.rxData;
        return !isOid(d.oidPower) && !isOid(d.oidMode) && !isOid(d.oidTarget);
    }

    private powerOf(raw: unknown): boolean | null {
        if (raw === undefined || raw === null) {
            return null;
        }
        const d = this.state.rxData;
        if (sameValue(raw, parseValue(d.powerOn, true))) {
            return true;
        }
        if (sameValue(raw, parseValue(d.powerOff, false))) {
            return false;
        }
        return toBool(raw);
    }

    private modeValue(m: Mode): ioBroker.StateValue {
        const d = this.state.rxData as unknown as Record<string, unknown>;
        return parseValue(d[`value${MODE_ATTR[m]}`], parseValue(MODE_DEFAULT[m], 0));
    }

    private modeOf(raw: unknown): Mode | null {
        if (raw === undefined || raw === null) {
            return null;
        }
        return MODES.find(m => sameValue(raw, this.modeValue(m))) || null;
    }

    private shownModes(): Mode[] {
        const d = this.state.rxData as unknown as Record<string, unknown>;
        return MODES.filter(m => isTrue(d[`show${MODE_ATTR[m]}`], true));
    }

    private range(): { min: number; max: number; step: number } {
        const d = this.state.rxData;
        let min = toNum(d.min) ?? 16;
        let max = toNum(d.max) ?? 30;
        if (max <= min) {
            min = 16;
            max = 30;
        }
        const step = toNum(d.step);
        return { min, max, step: step && step > 0 ? step : 0.5 };
    }

    private power(): boolean | null {
        if (this.isDemo()) {
            return this.state.demo.on;
        }
        if (this.state.opt.on !== undefined) {
            return this.state.opt.on;
        }
        const d = this.state.rxData;
        return isOid(d.oidPower) ? this.powerOf(this.ghVal(d.oidPower)) : true;
    }

    private mode(): Mode | null {
        if (this.isDemo()) {
            return this.state.demo.mode;
        }
        if (this.state.opt.mode !== undefined) {
            return this.state.opt.mode;
        }
        const d = this.state.rxData;
        return isOid(d.oidMode) ? this.modeOf(this.ghVal(d.oidMode)) : null;
    }

    private target(): number | null {
        if (this.state.opt.target !== undefined) {
            return this.state.opt.target;
        }
        if (this.isDemo()) {
            return this.state.demo.target;
        }
        return this.ghNum(this.state.rxData.oidTarget);
    }

    private flag(k: 'swing' | 'powerful'): boolean {
        if (this.isDemo()) {
            return this.state.demo[k];
        }
        const opt = this.state.opt[k];
        if (opt !== undefined) {
            return opt;
        }
        const id = k === 'swing' ? this.state.rxData.oidSwing : this.state.rxData.oidPowerful;
        return toBool(this.ghVal(id));
    }

    /* ---------- writing ---------- */

    private onPower = (): void => {
        if (this.props.editMode) {
            return;
        }
        const next = !this.power();
        if (this.isDemo()) {
            this.setState({ demo: { ...this.state.demo, on: next } });
            return;
        }
        const d = this.state.rxData;
        if (!isOid(d.oidPower)) {
            return;
        }
        this.ghSet(d.oidPower, parseValue(next ? d.powerOn : d.powerOff, next));
        this.hold('on', next);
    };

    private onMode(m: Mode): void {
        if (this.props.editMode || m === this.mode()) {
            return;
        }
        if (this.isDemo()) {
            this.setState({ demo: { ...this.state.demo, mode: m } });
            return;
        }
        const d = this.state.rxData;
        if (!isOid(d.oidMode)) {
            return;
        }
        this.ghSet(d.oidMode, this.modeValue(m));
        // the target of the new mode comes from the device (script), the old optimistic one is wrong now
        if (this.state.opt.target !== undefined && !this.sendTimer) {
            this.release('target');
        }
        this.hold('mode', m);
    }

    private onStep(dir: 1 | -1): void {
        if (this.props.editMode) {
            return;
        }
        const { min, max, step } = this.range();
        const cur = this.target() ?? (min + max) / 2;
        const next = Math.round(clamp(Math.round(cur / step) * step + dir * step, min, max) * 100) / 100;
        if (this.isDemo()) {
            this.setState({ demo: { ...this.state.demo, target: next } });
            return;
        }
        const id = this.state.rxData.oidTarget;
        if (!isOid(id)) {
            return;
        }
        this.hold('target', next);
        this.pendingTarget = next;
        if (this.sendTimer) {
            clearTimeout(this.sendTimer);
        }
        // several taps → one write
        this.sendTimer = setTimeout(() => {
            this.sendTimer = undefined;
            if (this.pendingTarget !== null) {
                this.ghSet(id, this.pendingTarget);
                this.pendingTarget = null;
            }
        }, SEND_MS);
    }

    private onFlag(k: 'swing' | 'powerful'): void {
        if (this.props.editMode) {
            return;
        }
        const next = !this.flag(k);
        if (this.isDemo()) {
            this.setState({ demo: { ...this.state.demo, [k]: next } });
            return;
        }
        const id = k === 'swing' ? this.state.rxData.oidSwing : this.state.rxData.oidPowerful;
        if (!isOid(id)) {
            return;
        }
        this.ghSet(id, next);
        this.hold(k, next);
    }

    /* ---------- rendering ---------- */

    private renderDial(
        target: number | null,
        room: number | null,
        hasSetpoint: boolean,
        dec: number,
        lang: string,
    ): React.JSX.Element {
        const { min, max } = this.range();
        const frac = (v: number): number => clamp((v - min) / (max - min), 0, 1);
        const p = hasSetpoint && target !== null ? frac(target) : 0;
        const roomAngle = room !== null ? A0 + SWEEP * frac(room) : null;
        const dot = roomAngle !== null ? pt(roomAngle) : null;
        const atMin = target !== null && target <= min + 1e-6;
        const atMax = target !== null && target >= max - 1e-6;
        const disabled = !hasSetpoint;
        const t = GlashausWidget.tr;
        return (
            <div className="gh-cl-dial">
                <div className="gh-cl-ring">
                    <svg
                        viewBox="0 0 200 168"
                        aria-hidden="true"
                    >
                        <path
                            className="gh-cl-trk"
                            d={ARC}
                            strokeWidth="9"
                        />
                        <path
                            className="gh-cl-val"
                            d={ARC}
                            strokeWidth="9"
                            pathLength={100}
                            strokeDasharray={`${(p * 100).toFixed(2)} 100`}
                            style={{ opacity: p > 0 ? 1 : 0 }}
                        />
                        {dot ? (
                            <circle
                                className="gh-cl-dot"
                                cx={dot[0]}
                                cy={dot[1]}
                                r="5.5"
                            />
                        ) : null}
                    </svg>
                    <div className="gh-cl-mid">
                        <span className="gh-cl-lbl">{t('cl_target')}</span>
                        {hasSetpoint ? (
                            <span className="gh-num gh-cl-n">
                                {fmtNum(target, dec, lang)}
                                <span className="gh-unit">°C</span>
                            </span>
                        ) : (
                            <>
                                <span className="gh-num gh-cl-n">–</span>
                                <span className="gh-cl-ns">{t('cl_no_setpoint')}</span>
                            </>
                        )}
                        {room !== null ? (
                            <span className="gh-cl-sub">
                                {t('cl_room')} {fmtNum(room, 1, lang)} °C
                            </span>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="gh-circ gh-cl-pm m"
                        aria-label={t('cl_down')}
                        disabled={disabled || atMin}
                        onClick={() => this.onStep(-1)}
                    >
                        <GhIcon name="minus" />
                    </button>
                    <button
                        type="button"
                        className="gh-circ gh-cl-pm p"
                        aria-label={t('cl_up')}
                        disabled={disabled || atMax}
                        onClick={() => this.onStep(1)}
                    >
                        <GhIcon name="plus" />
                    </button>
                </div>
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const t = GlashausWidget.tr;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const dec = Math.max(0, Math.min(2, toNum(d.decimals) ?? 1));
        const on = this.power();
        const mode = this.mode();
        const target = this.target();
        const room = this.ghNum(d.oidRoom, demo ? DEMO.room : null);
        const outdoor = this.ghNum(d.oidOutdoor, demo ? DEMO.outdoor : null);
        const accent = mode ? MODE_ACCENT[mode] : 'var(--gh-fg-2)';
        const hasSetpoint = !mode || !NO_SETPOINT.includes(mode);
        const modes = this.shownModes();
        const showSwing = demo || isOid(d.oidSwing);
        const showPowerful = isOid(d.oidPowerful);
        const today = this.ghNum(d.oidEnergyToday, demo ? DEMO.today : null);
        const year = this.ghNum(d.oidEnergyYear, demo ? DEMO.year : null);
        const unit = d.energyUnit || 'kWh';
        const title = d.title || (demo ? t('cl_demo_title') : '');
        const status = on === null ? '–' : !on ? t('cl_off') : mode ? t(`cl_mode_${mode}`) : t('cl_on');
        const showFooter = showSwing || showPowerful || outdoor !== null || today !== null || year !== null;

        const cls = ['gh-cl'];
        if (on === false) {
            cls.push('gh-cl-off');
        }
        if (this.props.editMode) {
            cls.push('gh-cl-edit');
        }

        return (
            <div
                className={this.ghClass(cls.join(' '))}
                style={{ '--gh-c': accent } as React.CSSProperties}
            >
                <div className="gh-cl-box">
                    <div className="gh-h">
                        <h2 className="gh-title">
                            <GhIconBox
                                name={this.ghIcon() || 'aircon'}
                                color={on ? accent : 'var(--gh-fg-2)'}
                            />
                            <span className="gh-cl-t">{title}</span>
                        </h2>
                        <div className="gh-cl-hr">
                            <GhPill
                                kind="idle"
                                live={!!on && !!mode}
                                color={on ? accent : undefined}
                            >
                                {status}
                            </GhPill>
                            {demo || isOid(d.oidPower) ? (
                                <button
                                    type="button"
                                    className="gh-toggle"
                                    role="switch"
                                    aria-checked={!!on}
                                    aria-label={t('cl_power')}
                                    onClick={this.onPower}
                                />
                            ) : null}
                        </div>
                    </div>

                    {this.renderDial(target, room, hasSetpoint, dec, lang)}

                    {modes.length > 1 && (demo || isOid(d.oidMode)) ? (
                        <div
                            className="gh-cl-modes"
                            role="group"
                            aria-label={t('group_cl_modes')}
                        >
                            {modes.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    className="gh-cl-m"
                                    aria-pressed={m === mode}
                                    title={t(`cl_mode_${m}`)}
                                    style={{ '--gh-c': MODE_ACCENT[m] } as React.CSSProperties}
                                    onClick={() => this.onMode(m)}
                                >
                                    <GhIcon name={MODE_ICON[m]} />
                                    <span>{t(`cl_mode_${m}`)}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {showFooter ? (
                        <div className="gh-cl-ft">
                            {showSwing ? (
                                <button
                                    type="button"
                                    className="gh-outline"
                                    aria-pressed={this.flag('swing')}
                                    title={t('cl_swing')}
                                    onClick={() => this.onFlag('swing')}
                                >
                                    <GhIcon name="swing" />
                                    <span>{t('cl_swing')}</span>
                                </button>
                            ) : null}
                            {showPowerful ? (
                                <button
                                    type="button"
                                    className="gh-outline"
                                    aria-pressed={this.flag('powerful')}
                                    title={t('cl_powerful')}
                                    onClick={() => this.onFlag('powerful')}
                                >
                                    <GhIcon name="bolt" />
                                    <span>{t('cl_powerful')}</span>
                                </button>
                            ) : null}
                            <div className="gh-cl-kv">
                                {outdoor !== null ? (
                                    <span>
                                        {t('cl_outdoor')} <b>{fmtNum(outdoor, 1, lang)} °C</b>
                                    </span>
                                ) : null}
                                {today !== null ? (
                                    <span className="gh-cl-e">
                                        {t('cl_today')}{' '}
                                        <b>
                                            {fmtNum(today, 1, lang)} {unit}
                                        </b>
                                    </span>
                                ) : null}
                                {year !== null ? (
                                    <span className="gh-cl-e">
                                        {t('cl_year')}{' '}
                                        <b>
                                            {fmtNum(year, year >= 100 ? 0 : 1, lang)} {unit}
                                        </b>
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

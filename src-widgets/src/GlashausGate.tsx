/* Gate / garage door: state (closed, open, partly open, moving, unknown) with a small door drawing
 * and buttons for open, partly open, stop and close. Commands go either to one command ID with a value per
 * button (e.g. DOOR_COMMAND of a Homematic IP drive: 1 open, 2 stop, 3 close, 4 partial) or to one ID per button.
 * A tap must be confirmed by a second tap (can be switched off), so that the gate does not move by accident. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIconBox, GhPill, type GhPillKind } from './core/components';
import { fmtTime, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

type GateCmd = 'open' | 'partial' | 'stop' | 'close';
type GatePos = 'closed' | 'open' | 'partial' | 'moving' | 'unknown';

interface GateRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    oidState: string;
    valClosed: string;
    valOpen: string;
    valPartial: string;
    oidMoving: string;
    cmdMode: 'one' | 'each';
    oidCommand: string;
    cmdOpen: string;
    cmdPartial: string;
    cmdStop: string;
    cmdClose: string;
    oidOpen: string;
    oidPartial: string;
    oidStop: string;
    oidClose: string;
    showPartial: boolean | string;
    showStop: boolean | string;
    confirm: boolean | string;
    showDrawing: boolean | string;
}

interface GateState extends VisRxWidgetState {
    /** Button waiting for the confirming second tap */
    armed: GateCmd | null;
    /** Demo state while no ID is configured */
    demoPos: GatePos;
}

const CMDS: GateCmd[] = ['open', 'partial', 'stop', 'close'];
/** Opening of the door drawing per state, 0 = closed, 1 = open */
const OPENING: Record<GatePos, number> = { closed: 0, partial: 0.3, open: 1, moving: 0.55, unknown: 0 };
const KIND: Record<GatePos, GhPillKind> = {
    closed: 'ok',
    open: 'warn',
    partial: 'info',
    moving: 'info',
    unknown: 'idle',
};

const isOne = (data: WidgetData): boolean => data.cmdMode === 'each';
const isEach = (data: WidgetData): boolean => data.cmdMode !== 'each';

const CSS = `
.gh.gh-gate{container:gh-gate/size}
.gh-gate .gh-h{flex-wrap:nowrap;margin-bottom:10px}
.gh-gate-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-gate-main{flex:1;min-height:0;display:flex;align-items:center;gap:20px}
.gh-gate-fig{flex:none;height:min(100%,120px);aspect-ratio:1.25;color:var(--gh-fg)}
.gh-gate-fig svg{display:block;width:100%;height:100%;overflow:visible}
.gh-gate-fig .frame{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.gh-gate-fig .ground{stroke:var(--gh-fg-3);stroke-width:2;stroke-linecap:round}
.gh-gate-fig .door{transition:transform 1.2s var(--gh-ease)}
.gh-gate-fig .panel{fill:color-mix(in srgb,var(--gh-c) 16%,transparent);stroke:var(--gh-c);stroke-width:1.6}
.gh-gate-fig .slat{stroke:var(--gh-c);stroke-width:1.2;opacity:.55}
.gh-gate-moving .door{animation:gh-gate-move 2.4s var(--gh-ease) infinite alternate}
@keyframes gh-gate-move{from{transform:translateY(0)}to{transform:translateY(-22px)}}
@media (prefers-reduced-motion:reduce){.gh-gate-moving .door{animation:none}}
.gh-gate-txt{min-width:0;display:flex;flex-direction:column;gap:4px}
.gh-gate-word{font-size:38px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-gate-since{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-gate-btns{display:flex;gap:8px;margin-top:14px;flex-wrap:nowrap}
.gh-gate-btns .gh-outline{flex:1 1 0;min-width:0;justify-content:center;padding:0 10px;height:40px}
.gh-gate-btns .gh-outline span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-gate-btns .gh-outline.armed{background:var(--gh-c);border-color:var(--gh-c);color:var(--gh-bg)}
.gh-gate-btns .gh-outline:disabled{opacity:.45;cursor:default}
@container gh-gate (max-height:200px){
  .gh-gate-fig{display:none}
  .gh-gate-word{font-size:30px}
}
@container gh-gate (max-width:330px){
  .gh-gate-fig{display:none}
  .gh-gate-word{font-size:30px}
  .gh-gate-btns{gap:6px}
  .gh-gate-btns .gh-outline{padding:0 6px;font-size:12.5px}
}
@container gh-gate (max-height:130px){
  .gh-gate .gh-ico{display:none}
  .gh-gate-since{display:none}
  .gh-gate-word{font-size:22px}
  .gh-gate .gh-h{margin-bottom:2px}
  .gh-gate-btns{margin-top:8px}
  .gh-gate-btns .gh-outline{height:34px}
}
`;

/** Garage door drawing; the door slides up by `opening` (0..1) */
function GateDrawing({ opening, color }: { opening: number; color: string }): React.JSX.Element {
    const clip = `gh-gate-clip-${React.useId().replace(/:/g, '')}`;
    const h = 58;
    const lift = Math.round(h * Math.max(0, Math.min(1, opening)) * 0.92);
    return (
        <svg
            viewBox="0 0 100 80"
            aria-hidden="true"
            style={{ '--gh-c': color } as React.CSSProperties}
        >
            <defs>
                <clipPath id={clip}>
                    <rect
                        x="18"
                        y="18"
                        width="64"
                        height="58"
                    />
                </clipPath>
            </defs>
            <path
                className="frame"
                d="M8 76 V30 L50 6 L92 30 V76"
            />
            <path
                className="frame"
                d="M18 76 V18 H82 V76"
            />
            <g clipPath={`url(#${clip})`}>
                <g
                    className="door"
                    style={{ transform: `translateY(${-lift}px)` }}
                >
                    <rect
                        className="panel"
                        x="20"
                        y="20"
                        width="60"
                        height="56"
                        rx="2"
                    />
                    {[31, 42, 53, 64].map(y => (
                        <line
                            key={y}
                            className="slat"
                            x1="22"
                            x2="78"
                            y1={y}
                            y2={y}
                        />
                    ))}
                </g>
            </g>
            <line
                className="ground"
                x1="2"
                x2="98"
                y1="77"
                y2="77"
            />
        </svg>
    );
}

export default class GlashausGate extends GlashausWidget<GateRxData, GateState> {
    private armTimer: ReturnType<typeof setTimeout> | undefined;

    private demoTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('gate', CSS);
        this.state = { ...this.state, armed: null, demoPos: 'closed' };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausGate',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Gate',
            visWidgetLabel: 'gate_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('garage'),
                        ...GlashausWidget.accentFields('', 'home'),
                        { name: 'showDrawing', label: 'gate_show_drawing', type: 'checkbox', default: true },
                        {
                            name: 'confirm',
                            label: 'gate_confirm',
                            type: 'checkbox',
                            default: true,
                            tooltip: 'gate_confirm_tip',
                        },
                    ],
                },
                {
                    name: 'gate_state',
                    label: 'group_gate_state',
                    fields: [
                        { name: 'oidState', label: 'gate_oid_state', type: 'id', tooltip: 'gate_oid_state_tip' },
                        { name: 'valClosed', label: 'gate_val_closed', default: '0', tooltip: 'gate_val_tip' },
                        { name: 'valOpen', label: 'gate_val_open', default: '1', tooltip: 'gate_val_tip' },
                        { name: 'valPartial', label: 'gate_val_partial', default: '2', tooltip: 'gate_val_tip' },
                        { name: 'oidMoving', label: 'gate_oid_moving', type: 'id', tooltip: 'gate_oid_moving_tip' },
                    ],
                },
                {
                    name: 'gate_cmd',
                    label: 'group_gate_cmd',
                    fields: [
                        {
                            name: 'cmdMode',
                            label: 'gate_cmd_mode',
                            type: 'select',
                            options: [
                                { value: 'one', label: 'gate_cmd_one' },
                                { value: 'each', label: 'gate_cmd_each' },
                            ],
                            default: 'one',
                        },
                        {
                            name: 'oidCommand',
                            label: 'gate_oid_command',
                            type: 'id',
                            hidden: isOne,
                            tooltip: 'gate_oid_command_tip',
                        },
                        { name: 'cmdOpen', label: 'gate_cmd_open', default: '1', hidden: isOne },
                        { name: 'cmdPartial', label: 'gate_cmd_partial', default: '4', hidden: isOne },
                        { name: 'cmdStop', label: 'gate_cmd_stop', default: '2', hidden: isOne },
                        { name: 'cmdClose', label: 'gate_cmd_close', default: '3', hidden: isOne },
                        {
                            name: 'oidOpen',
                            label: 'gate_oid_open',
                            type: 'id',
                            hidden: isEach,
                            tooltip: 'gate_oid_each_tip',
                        },
                        {
                            name: 'oidPartial',
                            label: 'gate_oid_partial',
                            type: 'id',
                            hidden: isEach,
                            tooltip: 'gate_oid_each_tip',
                        },
                        {
                            name: 'oidStop',
                            label: 'gate_oid_stop',
                            type: 'id',
                            hidden: isEach,
                            tooltip: 'gate_oid_each_tip',
                        },
                        {
                            name: 'oidClose',
                            label: 'gate_oid_close',
                            type: 'id',
                            hidden: isEach,
                            tooltip: 'gate_oid_each_tip',
                        },
                        { name: 'showPartial', label: 'gate_show_partial', type: 'checkbox', default: true },
                        { name: 'showStop', label: 'gate_show_stop', type: 'checkbox', default: true },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 420, height: 280, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_gate.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausGate.getWidgetInfo();
    }

    componentWillUnmount(): void {
        if (this.armTimer) {
            clearTimeout(this.armTimer);
        }
        if (this.demoTimer) {
            clearTimeout(this.demoTimer);
        }
        super.componentWillUnmount();
    }

    /** True while no state and no command ID is configured */
    private isDemo(): boolean {
        const d = this.state.rxData;
        return ![d.oidState, d.oidCommand, d.oidOpen, d.oidClose, d.oidPartial, d.oidStop].some(isOid);
    }

    /** Compares a state value with a configured value: numbers numerically, else text (case-insensitive) */
    private static same(v: unknown, cfg: string | number | undefined): boolean {
        if (cfg === undefined || cfg === null || cfg === '') {
            return false;
        }
        const a = toNum(v);
        const b = toNum(cfg);
        if (a !== null && b !== null) {
            return a === b;
        }
        return GlashausWidget.ghText(v).trim().toLowerCase() === String(cfg).trim().toLowerCase();
    }

    private position(): GatePos {
        const d = this.state.rxData;
        if (this.isDemo()) {
            return this.state.demoPos;
        }
        if (isOid(d.oidMoving) && toBool(this.ghVal(d.oidMoving))) {
            return 'moving';
        }
        if (!isOid(d.oidState)) {
            return 'unknown';
        }
        const v = this.ghVal(d.oidState);
        if (v === undefined || v === null) {
            return 'unknown';
        }
        if (GlashausGate.same(v, d.valClosed ?? '0')) {
            return 'closed';
        }
        if (GlashausGate.same(v, d.valOpen ?? '1')) {
            return 'open';
        }
        if (GlashausGate.same(v, d.valPartial ?? '2')) {
            return 'partial';
        }
        return 'unknown';
    }

    /** Value to write for a command in "one ID" mode: numbers stay numbers */
    private static cmdValue(raw: string | number | undefined, def: string): ioBroker.StateValue {
        const s = raw === undefined || raw === null || raw === '' ? def : String(raw);
        if (s === 'true' || s === 'false') {
            return s === 'true';
        }
        const n = toNum(s);
        return n !== null ? n : s;
    }

    private send(cmd: GateCmd): void {
        const d = this.state.rxData;
        if (this.isDemo()) {
            const next: Record<GateCmd, GatePos> = {
                open: 'open',
                partial: 'partial',
                close: 'closed',
                stop: 'unknown',
            };
            this.setState({ demoPos: cmd === 'stop' ? 'partial' : 'moving' });
            if (this.demoTimer) {
                clearTimeout(this.demoTimer);
            }
            if (cmd !== 'stop') {
                this.demoTimer = setTimeout(() => this.setState({ demoPos: next[cmd] }), 2600);
            }
            return;
        }
        if (d.cmdMode === 'each') {
            const id = { open: d.oidOpen, partial: d.oidPartial, stop: d.oidStop, close: d.oidClose }[cmd];
            this.ghSet(id, true);
            return;
        }
        const defs: Record<GateCmd, string> = { open: '1', partial: '4', stop: '2', close: '3' };
        const raw = { open: d.cmdOpen, partial: d.cmdPartial, stop: d.cmdStop, close: d.cmdClose }[cmd];
        this.ghSet(d.oidCommand, GlashausGate.cmdValue(raw, defs[cmd]));
    }

    private onTap(cmd: GateCmd): void {
        if (this.props.editMode) {
            return;
        }
        const needConfirm = isTrue(this.state.rxData.confirm, true) && cmd !== 'stop';
        if (needConfirm && this.state.armed !== cmd) {
            this.setState({ armed: cmd });
            if (this.armTimer) {
                clearTimeout(this.armTimer);
            }
            this.armTimer = setTimeout(() => this.setState({ armed: null }), 3500);
            return;
        }
        if (this.armTimer) {
            clearTimeout(this.armTimer);
        }
        this.setState({ armed: null });
        this.send(cmd);
    }

    /** Is a command possible with the configuration? */
    private canSend(cmd: GateCmd): boolean {
        const d = this.state.rxData;
        if (this.isDemo()) {
            return true;
        }
        if (d.cmdMode === 'each') {
            return isOid({ open: d.oidOpen, partial: d.oidPartial, stop: d.oidStop, close: d.oidClose }[cmd]);
        }
        return isOid(d.oidCommand);
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const pos = this.position();
        const accent = this.ghAccent('', 'home');
        const posColor = pos === 'open' ? 'var(--gh-warn)' : pos === 'unknown' ? 'var(--gh-fg-3)' : accent;
        const title = d.title || GlashausWidget.tr('gate_default_title');
        const lc = demo ? undefined : this.ghLc(d.oidState);
        const shown = CMDS.filter(
            c => (c !== 'partial' || isTrue(d.showPartial, true)) && (c !== 'stop' || isTrue(d.showStop, true)),
        );

        return (
            <div
                className={this.ghClass(`gh-gate${pos === 'moving' ? ' gh-gate-moving' : ''}`)}
                style={{ '--gh-c': accent } as React.CSSProperties}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                        <span className="gh-gate-t">{title}</span>
                    </h2>
                    <GhPill kind={KIND[pos]}>{GlashausWidget.tr(`gate_pos_${pos}`)}</GhPill>
                </div>
                <div className="gh-gate-main">
                    {isTrue(d.showDrawing, true) ? (
                        <div className="gh-gate-fig">
                            <GateDrawing
                                opening={OPENING[pos]}
                                color={posColor}
                            />
                        </div>
                    ) : null}
                    <div className="gh-gate-txt">
                        <span className="gh-it gh-gate-word">{GlashausWidget.tr(`gate_word_${pos}`)}</span>
                        {lc ? (
                            <span className="gh-muted gh-small gh-gate-since">
                                {GlashausWidget.tr('gate_since', fmtTime(lc, lang))}
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="gh-gate-btns">
                    {shown.map(c => (
                        <button
                            key={c}
                            type="button"
                            className={`gh-outline${this.state.armed === c ? ' armed' : ''}`}
                            disabled={!this.canSend(c)}
                            onClick={() => this.onTap(c)}
                            aria-label={GlashausWidget.tr(`gate_btn_${c}`)}
                        >
                            <span>
                                {this.state.armed === c
                                    ? GlashausWidget.tr('gate_tap_again')
                                    : GlashausWidget.tr(`gate_btn_${c}`)}
                            </span>
                        </button>
                    ))}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

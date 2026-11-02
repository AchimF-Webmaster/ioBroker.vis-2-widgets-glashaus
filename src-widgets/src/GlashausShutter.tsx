/* Roller shutter: a window drawing whose blind follows the position, the position in percent and buttons for up,
 * stop and down. Dragging on the window sets a new position (written when the finger is lifted).
 * Made for Homematic blind actuators (LEVEL 0 = closed … 100 = open, STOP, WORKING, DIRECTION), but generic:
 * min/max, inverted direction and an own read ID are configurable. */
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
import { clamp, fmtNum, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface ShutterRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    oid: string;
    oidState: string;
    min: number | string;
    max: number | string;
    invert: boolean | string;
    oidStop: string;
    valueStop: string;
    oidWorking: string;
    oidDirection: string;
    presets: string;
    showDrawing: boolean | string;
}

interface ShutterState extends VisRxWidgetState {
    /** Position in % open while dragging (null: not dragging) */
    drag: number | null;
    /** Target written last (% open), shown until the state reaches it */
    target: number | null;
    /** Demo position (% open) */
    demo: number;
}

const notStop = (data: WidgetData): boolean => !isOid(data.oidStop);

const CSS = `
.gh.gh-sh{container:gh-sh/size}
.gh-sh .gh-h{flex-wrap:nowrap;margin-bottom:10px}
.gh-sh-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sh-main{flex:1;min-height:0;display:flex;align-items:center;gap:22px}
.gh-sh-win{flex:none;height:100%;max-height:150px;aspect-ratio:.82;position:relative;touch-action:none;cursor:ns-resize;
  border-radius:12px;box-shadow:inset 0 0 0 2px var(--gh-fg);overflow:hidden;
  background:linear-gradient(180deg,color-mix(in srgb,var(--gh-home) 22%,transparent),color-mix(in srgb,var(--gh-sun) 14%,transparent))}
.gh-sh-win.edit{cursor:default}
.gh-sh-win::after{content:'';position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--gh-fg);opacity:.85}
.gh-sh-blind{position:absolute;left:0;right:0;top:0;transition:height .9s var(--gh-ease);
  background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--gh-c) 30%,var(--gh-bg)) 0 8px,color-mix(in srgb,var(--gh-c) 55%,var(--gh-bg)) 8px 9.5px);
  box-shadow:0 2px 0 var(--gh-c);z-index:1}
.gh-sh-win.drag .gh-sh-blind{transition:none}
.gh-sh-txt{min-width:0;display:flex;flex-direction:column;gap:2px}
.gh-sh-num{font-size:46px;line-height:1}
.gh-sh-word{font-size:22px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-sh-pre{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.gh-sh-pre .gh-outline{height:28px;padding:0 10px;font-size:12px}
.gh-sh-btns{display:flex;gap:8px;margin-top:14px}
.gh-sh-btns .gh-outline{flex:1 1 0;min-width:0;justify-content:center;height:40px;padding:0 8px}
.gh-sh-btns .gh-outline span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sh-btns .gh-outline svg{width:16px;height:16px;flex:none}
@container gh-sh (max-width:300px){.gh-sh-num{font-size:36px}.gh-sh-pre{display:none}.gh-sh-btns .gh-outline span{display:none}}
@container gh-sh (max-height:210px){.gh-sh-pre{display:none}.gh-sh-word{display:none}}
@container gh-sh (max-height:150px){.gh-sh-win{display:none}.gh-sh-num{font-size:28px}.gh-sh .gh-h{margin-bottom:4px}.gh-sh-btns{margin-top:8px}.gh-sh-btns .gh-outline{height:34px}}
`;

const ARROW_UP = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
);
const ARROW_DOWN = (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
);
const STOP = (
    <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <rect
            x="7"
            y="7"
            width="10"
            height="10"
            rx="1.5"
        />
    </svg>
);

export default class GlashausShutter extends GlashausWidget<ShutterRxData, ShutterState> {
    private winRef = React.createRef<HTMLDivElement>();

    private targetTimer: ReturnType<typeof setTimeout> | undefined;

    private demoTimer: ReturnType<typeof setInterval> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('shutter', CSS);
        this.state = { ...this.state, drag: null, target: null, demo: 65 };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausShutter',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Shutter',
            visWidgetLabel: 'sh_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('window'),
                        ...GlashausWidget.accentFields('', 'home'),
                        { name: 'oid', label: 'sh_oid', type: 'id', tooltip: 'sh_oid_tip' },
                        { name: 'oidState', label: 'sh_oid_state', type: 'id', tooltip: 'sh_oid_state_tip' },
                        { name: 'min', label: 'sh_min', type: 'number', default: 0 },
                        { name: 'max', label: 'sh_max', type: 'number', default: 100 },
                        {
                            name: 'invert',
                            label: 'sh_invert',
                            type: 'checkbox',
                            default: false,
                            tooltip: 'sh_invert_tip',
                        },
                        { name: 'presets', label: 'sh_presets', default: '30,70', tooltip: 'sh_presets_tip' },
                        { name: 'showDrawing', label: 'sh_show_drawing', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'sh_more',
                    label: 'group_sh_more',
                    fields: [
                        { name: 'oidStop', label: 'sh_oid_stop', type: 'id', tooltip: 'sh_oid_stop_tip' },
                        { name: 'valueStop', label: 'sh_value_stop', default: 'true', hidden: notStop },
                        { name: 'oidWorking', label: 'sh_oid_working', type: 'id', tooltip: 'sh_oid_working_tip' },
                        {
                            name: 'oidDirection',
                            label: 'sh_oid_direction',
                            type: 'id',
                            tooltip: 'sh_oid_direction_tip',
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 360, height: 280, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_shutter.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausShutter.getWidgetInfo();
    }

    componentWillUnmount(): void {
        if (this.targetTimer) {
            clearTimeout(this.targetTimer);
        }
        if (this.demoTimer) {
            clearInterval(this.demoTimer);
        }
        super.componentWillUnmount();
    }

    private isDemo(): boolean {
        return !isOid(this.state.rxData.oid);
    }

    private range(): [number, number] {
        const d = this.state.rxData;
        const min = toNum(d.min) ?? 0;
        const max = toNum(d.max) ?? 100;
        return max === min ? [0, 100] : [min, max];
    }

    /** Raw value → % open */
    private toPct(raw: number): number {
        const [min, max] = this.range();
        const p = clamp(((raw - min) / (max - min)) * 100, 0, 100);
        return isTrue(this.state.rxData.invert) ? 100 - p : p;
    }

    /** % open → raw value */
    private fromPct(p: number): number {
        const [min, max] = this.range();
        const q = isTrue(this.state.rxData.invert) ? 100 - p : p;
        const v = min + (q / 100) * (max - min);
        return Math.round(v * 100) / 100;
    }

    /** Current position in % open, or null */
    private position(): number | null {
        if (this.isDemo()) {
            return this.state.demo;
        }
        const d = this.state.rxData;
        const raw = toNum(this.ghVal(isOid(d.oidState) ? d.oidState : d.oid));
        return raw === null ? null : this.toPct(raw);
    }

    /** -1 down, 1 up, 0 still */
    private moving(): number {
        const d = this.state.rxData;
        if (this.isDemo()) {
            return this.demoTimer ? ((this.state.target ?? 0) > this.state.demo ? 1 : -1) : 0;
        }
        if (isOid(d.oidDirection)) {
            const dir = toNum(this.ghVal(d.oidDirection));
            if (dir === 1) {
                return isTrue(d.invert) ? -1 : 1;
            }
            if (dir === 2) {
                return isTrue(d.invert) ? 1 : -1;
            }
        }
        if (isOid(d.oidWorking) && toBool(this.ghVal(d.oidWorking))) {
            const pos = this.position();
            const t = this.state.target;
            return t !== null && pos !== null && t < pos ? -1 : 1;
        }
        return 0;
    }

    private go(pct: number): void {
        if (this.props.editMode) {
            return;
        }
        const p = Math.round(clamp(pct, 0, 100));
        this.setState({ target: p });
        if (this.targetTimer) {
            clearTimeout(this.targetTimer);
        }
        this.targetTimer = setTimeout(() => this.setState({ target: null }), 90000);
        if (this.isDemo()) {
            this.runDemo(p);
            return;
        }
        this.ghSet(this.state.rxData.oid, this.fromPct(p));
    }

    private stop(): void {
        if (this.props.editMode) {
            return;
        }
        const d = this.state.rxData;
        if (this.isDemo()) {
            if (this.demoTimer) {
                clearInterval(this.demoTimer);
                this.demoTimer = undefined;
            }
            this.setState({ target: null });
            return;
        }
        this.setState({ target: null });
        if (isOid(d.oidStop)) {
            const s = d.valueStop === undefined || d.valueStop === '' ? 'true' : String(d.valueStop);
            const n = toNum(s);
            this.ghSet(d.oidStop, s === 'true' ? true : s === 'false' ? false : n !== null ? n : s);
        }
    }

    /** Demo: moves the blind 2 % every 100 ms */
    private runDemo(target: number): void {
        if (this.demoTimer) {
            clearInterval(this.demoTimer);
        }
        this.demoTimer = setInterval(() => {
            const cur = this.state.demo;
            if (Math.abs(cur - target) <= 2) {
                clearInterval(this.demoTimer);
                this.demoTimer = undefined;
                this.setState({ demo: target, target: null });
                return;
            }
            this.setState({ demo: cur + (target > cur ? 2 : -2) });
        }, 100);
    }

    private pctFromPointer(e: React.PointerEvent): number {
        const r = this.winRef.current?.getBoundingClientRect();
        if (!r || r.height <= 0) {
            return 0;
        }
        // blind edge at the finger: top = 100 % open, bottom = closed
        return clamp(100 - ((e.clientY - r.top) / r.height) * 100, 0, 100);
    }

    private onShDown = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (this.props.editMode) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        this.setState({ drag: this.pctFromPointer(e) });
    };

    private onShMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (this.state.drag !== null) {
            this.setState({ drag: this.pctFromPointer(e) });
        }
    };

    private onShUp = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (this.state.drag === null) {
            return;
        }
        const p = Math.round(this.pctFromPointer(e) / 5) * 5;
        this.setState({ drag: null });
        this.go(p);
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const accent = this.ghAccent('', 'home');
        const pos = this.position();
        const shown = this.state.drag ?? pos;
        const mv = this.moving();
        const title = d.title || GlashausWidget.tr('sh_default_title');
        let kind: GhPillKind = 'idle';
        let pill = GlashausWidget.tr('sh_unknown');
        if (mv !== 0) {
            kind = 'info';
            pill = GlashausWidget.tr(mv > 0 ? 'sh_moving_up' : 'sh_moving_down');
        } else if (pos !== null) {
            kind = pos <= 2 ? 'ok' : 'idle';
            pill =
                pos <= 2
                    ? GlashausWidget.tr('sh_closed')
                    : pos >= 98
                      ? GlashausWidget.tr('sh_open')
                      : GlashausWidget.tr('sh_partly');
        }
        const word =
            this.state.drag !== null
                ? GlashausWidget.tr('sh_release')
                : this.state.target !== null && pos !== null && Math.abs(this.state.target - pos) > 2
                  ? GlashausWidget.tr('sh_target', fmtNum(this.state.target, 0, lang))
                  : pos === null
                    ? ''
                    : pos <= 2
                      ? GlashausWidget.tr('sh_word_closed')
                      : pos >= 98
                        ? GlashausWidget.tr('sh_word_open')
                        : GlashausWidget.tr('sh_word_partly');
        const presets = (d.presets ?? '30,70')
            .split(',')
            .map(s => toNum(s))
            .filter((n): n is number => n !== null && n > 0 && n < 100)
            .slice(0, 4);

        return (
            <div
                className={this.ghClass('gh-sh')}
                style={{ '--gh-c': accent } as React.CSSProperties}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                        <span className="gh-sh-t">{title}</span>
                    </h2>
                    <GhPill
                        kind={kind}
                        live={mv !== 0}
                    >
                        {pill}
                    </GhPill>
                </div>
                <div className="gh-sh-main">
                    {isTrue(d.showDrawing, true) ? (
                        <div
                            ref={this.winRef}
                            className={`gh-sh-win${this.props.editMode ? ' edit' : ''}${this.state.drag !== null ? ' drag' : ''}`}
                            role="slider"
                            aria-label={title}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={shown === null ? undefined : Math.round(shown)}
                            tabIndex={0}
                            onPointerDown={this.onShDown}
                            onPointerMove={this.onShMove}
                            onPointerUp={this.onShUp}
                            onPointerCancel={() => this.setState({ drag: null })}
                            onKeyDown={e => {
                                if (shown === null) {
                                    return;
                                }
                                if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    this.go(shown + 10);
                                } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    this.go(shown - 10);
                                }
                            }}
                        >
                            <div
                                className="gh-sh-blind"
                                style={{ height: `${100 - (shown ?? 100)}%` }}
                            />
                        </div>
                    ) : null}
                    <div className="gh-sh-txt">
                        <span className="gh-num gh-sh-num">
                            {shown === null ? '–' : fmtNum(shown, 0, lang)}
                            <span className="gh-unit">{GlashausWidget.tr('sh_unit')}</span>
                        </span>
                        <span className="gh-it gh-sh-word">{word}</span>
                        {presets.length ? (
                            <div className="gh-sh-pre">
                                {presets.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        className="gh-outline"
                                        onClick={() => this.go(p)}
                                    >
                                        {fmtNum(p, 0, lang)} %
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="gh-sh-btns">
                    <button
                        type="button"
                        className="gh-outline"
                        onClick={() => this.go(100)}
                        aria-label={GlashausWidget.tr('sh_up')}
                    >
                        {ARROW_UP}
                        <span>{GlashausWidget.tr('sh_up')}</span>
                    </button>
                    <button
                        type="button"
                        className="gh-outline"
                        onClick={() => this.stop()}
                        disabled={!demo && !isOid(d.oidStop)}
                        aria-label={GlashausWidget.tr('sh_stop')}
                    >
                        {STOP}
                        <span>{GlashausWidget.tr('sh_stop')}</span>
                    </button>
                    <button
                        type="button"
                        className="gh-outline"
                        onClick={() => this.go(0)}
                        aria-label={GlashausWidget.tr('sh_down')}
                    >
                        {ARROW_DOWN}
                        <span>{GlashausWidget.tr('sh_down')}</span>
                    </button>
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { ICON_PATHS, FILLED_ICONS } from "./icons.js";
import { useTheme } from "./theme.js";
/* The one string the design system owns that a user reads. Everything else in
   here is passed in by the caller, which is why this is the only import of the
   app's i18n runtime from inside the design system. */
import { t } from "../i18n.mjs";

import "./tokens.css";
import "./base.css";
import "./components.css";

/* ═══════════════════════════════════════════════════════════════════════════
   Point Poker design system — components

   The ten rules these are built to (the long form is in README.md):

    1. Use a token. Never a raw px or hex value.
    2. Exactly one primary action per screen.
    3. Selection is aria-pressed / aria-selected, never an .active class.
    4. Nothing below 13px. Nothing below 16px in a field. Nothing below --text-3.
    5. Colour never carries meaning alone — say it in words too.
    6. Every control clears 44px.
    7. Animate transform and opacity only, and respect prefers-reduced-motion.
    8. Numbers are Outfit with tabular-nums. The serif is for words.
    9. Do not render state that has not happened. Zeroes read as data.
   10. Reading order is importance order.
   ═══════════════════════════════════════════════════════════════════════════ */

const cx = (...parts) => parts.filter(Boolean).join(" ");

export { useTheme, setTheme, STORAGE_KEY, DEFAULT_THEME } from "./theme.js";
export { ICON_PATHS, FILLED_ICONS } from "./icons.js";

/* ── Brand ──────────────────────────────────────────────────────────────── */

/** The single stroke family. Decorative and aria-hidden unless given a title. */
export function Icon({ name, size = 20, title, className, ...rest }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const filled = FILLED_ICONS.includes(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

/** The Point Poker lockup: a brass card pip beside a lowercase wordmark. */
export function Logo({ size = "md", serif = false, onFelt = false, markOnly = false, as = "a", href = "/", className, ...rest }) {
  const Tag = as;
  return (
    <Tag
      className={cx("pp-logo", size !== "md" && `pp-logo--${size}`, serif && "pp-logo--serif", onFelt && "pp-logo--on-felt", className)}
      href={Tag === "a" ? href : undefined}
      aria-label="Point Poker"
      {...rest}
    >
      <span className="pp-logo__mark" aria-hidden="true" />
      {!markOnly && <span className="pp-logo__word">Point <em>Poker</em></span>}
    </Tag>
  );
}

/* ── Actions ────────────────────────────────────────────────────────────── */

/** The action primitive. Exactly one variant="primary" per screen. */
export function Button({ variant = "secondary", size = "md", block = false, as, href, children, className, ...rest }) {
  const Tag = as || (href ? "a" : "button");
  return (
    <Tag
      className={cx("pp-btn", `pp-btn--${variant}`, size !== "md" && `pp-btn--${size}`, block && "pp-btn--block", className)}
      href={href}
      /* A <button> with no type inside a form submits it. That has swallowed a
         room-creation form on this product once already. */
      type={Tag === "button" ? rest.type || "button" : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** A square control whose only label is its glyph. `label` is required and
    becomes the accessible name — an icon alone is not a label. */
export function IconButton({ icon, label, size = "md", bordered = false, className, ...rest }) {
  return (
    <button
      type="button"
      className={cx("pp-icon-btn", size === "sm" && "pp-icon-btn--sm", bordered && "pp-icon-btn--bordered", className)}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 18 : 20} />
    </button>
  );
}

/** An option in an exclusive group. Selection is aria-pressed — never a class,
    because a class lets the visual state and the announced state disagree. */
export function Choice({ label, description, icon, selected = false, compact = false, onSelect, className, ...rest }) {
  return (
    <button
      type="button"
      className={cx("pp-choice", compact && "pp-choice--compact", className)}
      aria-pressed={selected}
      onClick={onSelect}
      {...rest}
    >
      {icon && <Icon name={icon} size={22} className="pp-choice__icon" />}
      <span className="pp-choice__label">{label}</span>
      {description && <span className="pp-choice__desc">{description}</span>}
    </button>
  );
}

/** Equal-width row. Use ChoiceGrid with cols for four or more. */
export const ChoiceRow = React.forwardRef(function ChoiceRow({ children, className, ...rest }, ref) {
  return <div ref={ref} className={cx("pp-choice-row", className)} {...rest}>{children}</div>;
});

export const ChoiceGrid = React.forwardRef(function ChoiceGrid({ cols = 2, children, className, ...rest }, ref) {
  return <div ref={ref} className={cx("pp-choice-grid", className)} style={{ "--choice-cols": cols }} {...rest}>{children}</div>;
});

/** Two to four mutually exclusive views. More than four wants Tabs. */
export function SegmentedControl({ options, value, onChange, block = false, ariaLabel, className }) {
  return (
    <div className={cx("pp-segmented", block && "pp-segmented--block", className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pp-segmented__item"
          aria-pressed={o.value === value}
          onClick={() => onChange && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The theme control: a two-position switch that names the position it is in.
 *
 * It used to be an IconButton labelled with its own outcome — "Switch to the
 * light theme" over a sun glyph — on the reasoning that a control labelled with
 * its current state is the most reliably misread thing on the web. That
 * reasoning is right, and it is right *about buttons*. A button has one
 * appearance and only its name to say what will happen, so naming the state
 * leaves the reader guessing which half of the sentence they are looking at.
 *
 * A switch does not have that problem, because a switch has a visible position.
 * `role="switch"` exists precisely so the name can be the thing and the state
 * can be the state, and here they are both on the control: the word says which
 * theme is on, the thumb says which side it is on, and they cannot disagree.
 *
 * The label says "Dark theme", not "Dark", because the bare word is only a
 * whole thought while you are looking at the switch it sits on. There is no
 * aria-label: the visible text is the accessible name, which is the only
 * arrangement WCAG 2.5.3 cannot be broken by — someone driving the page by
 * voice reads the word off the screen and says it, and it matches.
 *
 * "theme" is a separate span so a narrow navbar can drop it to "Dark" without
 * dropping the control. It is clipped rather than display:none for the reason
 * above in reverse: clipped text still counts as the accessible name, so a
 * phone screen reader hears the whole "Dark theme" it can no longer show.
 *
 * checked = light, because dark is the default and a switch's on-position
 * should be the thing you turned on.
 */
/** `compactOnNarrow` clips the visible word below the small breakpoint and
    keeps the knob — for a bar that runs out of width there. The accessible name
    is unchanged either way, and the switch is never hidden: the theme lives
    nowhere else. */
export function ThemeToggle({ compactOnNarrow = false, className }) {
  const [theme, set] = useTheme();
  const light = theme === "light";
  const word = light ? t("theme.light") : t("theme.dark");
  const onChange = useCallback((e) => set(e.target.checked ? "light" : "dark"), [set]);
  return (
    <Switch
      className={cx("pp-theme-switch", compactOnNarrow && "pp-theme-switch--compact-narrow", className)}
      label={<>{word}<span className="pp-theme-switch__suffix">{t("theme.suffix")}</span></>}
      checked={light}
      onChange={onChange}
    />
  );
}

/* ── Forms ──────────────────────────────────────────────────────────────── */

/** Label + control + hint/error as one unit. Never ship a bare input.
    Forwards its ref to the control, so a caller that has to focus or read the
    field imperatively does not have to reach past the component to do it. */
export const TextField = React.forwardRef(function TextField(
  { label, hint, error, required = false, size = "md", multiline = false, id, className, children, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id || auto;
  const describedBy = cx(hint && `${fieldId}-hint`, error && `${fieldId}-err`) || undefined;
  const Control = multiline ? "textarea" : "input";
  const control = (
    <Control
      ref={ref}
      id={fieldId}
      className={cx(multiline ? "pp-textarea" : "pp-input", size === "lg" && "pp-input--lg")}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      required={required}
      {...rest}
    />
  );
  return (
    <div className={cx("pp-field", className)}>
      <label className="pp-label" htmlFor={fieldId}>
        {label}
        {required && <span className="pp-label__req" aria-hidden="true"> *</span>}
      </label>
      {/* `children` is the trailing control in an input group — a Save or Add
          button that belongs to this field and nothing else. */}
      {children ? <div className="pp-input-group">{control}{children}</div> : control}
      {hint && !error && <span className="pp-hint" id={`${fieldId}-hint`}>{hint}</span>}
      {error && <span className="pp-error" id={`${fieldId}-err`} role="alert">{error}</span>}
    </div>
  );
});

export function Select({ label, hint, error, options = [], id, className, ...rest }) {
  const auto = useId();
  const fieldId = id || auto;
  const describedBy = cx(hint && `${fieldId}-hint`, error && `${fieldId}-err`) || undefined;
  return (
    <div className={cx("pp-field", className)}>
      {label && <label className="pp-label" htmlFor={fieldId}>{label}</label>}
      <span className="pp-select">
        <select
          id={fieldId}
          className="pp-select__control"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </span>
      {hint && !error && <span className="pp-hint" id={`${fieldId}-hint`}>{hint}</span>}
      {error && <span className="pp-error" id={`${fieldId}-err`} role="alert">{error}</span>}
    </div>
  );
}

export function Switch({ label, checked, onChange, className, ...rest }) {
  return (
    <label className={cx("pp-switch", className)}>
      <input type="checkbox" className="pp-switch__input" role="switch" checked={checked} onChange={onChange} {...rest} />
      <span className="pp-switch__track" aria-hidden="true"><span className="pp-switch__thumb" /></span>
      <span className="pp-switch__label">{label}</span>
    </label>
  );
}

export function Checkbox({ label, type = "checkbox", className, ...rest }) {
  return (
    <label className={cx("pp-check", type === "radio" && "pp-check--radio", className)}>
      <input type={type} className="pp-check__input" {...rest} />
      <span className="pp-check__box" aria-hidden="true" />
      <span className="pp-check__label">{label}</span>
    </label>
  );
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

/** One card shape. Variants change intent, never geometry.
    `as` exists for the one case that needs it: a whole card that is a link.
    Wrapping the card in an <a> instead nests the heading inside the link text,
    which is what makes a screen reader read the entire card as one link name. */
export function Card({ as = "div", variant, interactive = false, pad, eyebrow, title, titleAs = "h3", editorial = false, children, footer, className, ...rest }) {
  const Tag = as;
  const Title = titleAs;
  return (
    <Tag
      className={cx("pp-card", variant && `pp-card--${variant}`, interactive && "pp-card--interactive",
        pad && `pp-card--pad-${pad}`, editorial && "pp-card--editorial", className)}
      {...rest}
    >
      {eyebrow && <span className="pp-card__eyebrow">{eyebrow}</span>}
      {title && <Title className="pp-card__title">{title}</Title>}
      {children && <div className="pp-card__body">{children}</div>}
      {footer && <div className="pp-card__footer">{footer}</div>}
    </Tag>
  );
}

/**
 * A measured number. Renders the sentence explaining what will appear here
 * rather than a zero, because a zero reads as data — "0 stories estimated"
 * looks like a finished session that went badly, not an empty one.
 */
export function StatTile({ label, value, meta, hero = false, gold = false, inline = false, empty, className }) {
  const absent = value === null || value === undefined;
  return (
    <div className={cx("pp-stat", hero && "pp-stat--hero", gold && "pp-stat--gold", inline && "pp-stat--inline", className)}>
      <span className="pp-stat__label">{label}</span>
      {absent
        ? <span className="pp-stat__meta">{empty || "Appears after the first reveal"}</span>
        : <span className="pp-stat__value" data-numeric>{value}</span>}
      {meta && !absent && <span className="pp-stat__meta">{meta}</span>}
    </div>
  );
}

/** Page opening. Felt ground by default; paper for content pages. */
export function Hero({ eyebrow, title, subtitle, actions, trust, paper = false, centred = false, aside, className }) {
  return (
    <section className={cx("pp-hero", paper && "pp-hero--paper", centred && "pp-hero--centred", className)}>
      <div className="pp-hero__inner">
        <div className="pp-hero__copy">
          {eyebrow && <span className="pp-hero__eyebrow">{eyebrow}</span>}
          <h1 className="pp-hero__title">{title}</h1>
          {subtitle && <p className="pp-hero__sub">{subtitle}</p>}
          {actions && <div className="pp-hero__actions">{actions}</div>}
          {trust && <div className="pp-hero__trust">{trust}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** The playing card. The one literal casino element in the system, and the
    product's signature object: corner pips top-left and bottom-right, the value
    and its suit in the middle, on ivory stock that does not follow the theme.

    `locked` is aria-disabled rather than `disabled` on purpose — see the note on
    .pp-vote-card[aria-disabled] in components.css. The caller is still expected
    to refuse the click, which is why onSelect is guarded here too. */
export function VoteCard({ value, suit = "♦", selected = false, red = false, wild = false, locked = false, onSelect, className, ...rest }) {
  const pip = (
    <>
      <span className="pp-vote-card__rank">{value}</span>
      <span className="pp-vote-card__suit">{suit}</span>
    </>
  );
  return (
    <button
      type="button"
      className={cx("pp-vote-card", red && "pp-vote-card--red", wild && "pp-vote-card--wild", className)}
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      aria-pressed={selected}
      aria-label={`Play ${value}`}
      onClick={locked ? undefined : onSelect}
      {...rest}
    >
      <span className="pp-vote-card__face">
        <span className="pp-vote-card__pip">{pip}</span>
        <span className="pp-vote-card__centre">
          <span className="pp-vote-card__value">{value}</span>
          <span className="pp-vote-card__value-suit">{suit}</span>
        </span>
        <span className="pp-vote-card__pip pp-vote-card__pip--br">{pip}</span>
      </span>
    </button>
  );
}

/** The hand. Wraps; centres itself once the room drops to one column. */
export function VoteHand({ children, className }) {
  return <div className={cx("pp-vote-hand", className)}>{children}</div>;
}

/** The grid of played cards after the reveal. */
export function RevealGrid({ children, className }) {
  return <div className={cx("pp-reveal-grid", className)}>{children}</div>;
}

/** One player's card once the cards are up: the face, their name, and whatever
    the round has to say about it. `tone` borders the face; `tag` is the word
    that says the same thing, because a border alone is Rule 5's failure case. */
export function RevealCard({ value, name, red = false, tone, you = false, tag, children, className, ...rest }) {
  return (
    <div className={cx("pp-reveal-card", tone && `pp-reveal-card--${tone}`, className)} {...rest}>
      <div className="pp-reveal-card__face">
        <span className={cx("pp-reveal-card__value", red && "pp-reveal-card__value--red")}>{value}</span>
      </div>
      <div className="pp-reveal-card__name">{name}</div>
      {you && <span className="pp-reveal-card__you">you</span>}
      {tag && <span className={cx("pp-reveal-card__tag", tone && `pp-reveal-card__tag--${tone}`)}>{tag}</span>}
      {children}
    </div>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────── */

/** States a fact. Never a control. */
export function Chip({ tone, dot = false, count = false, children, className }) {
  return (
    <span className={cx("pp-chip", tone && `pp-chip--${tone}`, count && "pp-chip--count", className)}>
      {dot && <span className="pp-chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size, state, facilitator = false, className }) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("");
  return (
    <span
      className={cx("pp-avatar", size && `pp-avatar--${size}`, state && `pp-avatar--${state}`, facilitator && "pp-avatar--facilitator", className)}
      title={name}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ children, className }) {
  return <span className={cx("pp-avatar-stack", className)}>{children}</span>;
}

/** The roster. Takes <Participant> children rather than a people array, because
    the room draws voters and observers from two different lists into one <ul>
    and the two rows carry different controls. */
export function ParticipantList({ children, className }) {
  return <ul className={cx("pp-participant-list", className)}>{children}</ul>;
}

/** One row. Rule 5: the brass ring on the avatar says "voted" and so does the
    word beside it — neither carries the meaning alone. `tone` drives both. */
export function Participant({ name, you = false, tone = "waiting", meta, actions, className }) {
  return (
    <li className={cx("pp-participant", `pp-participant--${tone}`, className)}>
      <Avatar
        name={name}
        size="sm"
        state={tone === "observer" ? undefined : tone}
        facilitator={tone === "observer"}
      />
      <div className="pp-participant__body">
        <div className="pp-participant__name">{name}{you ? " (you)" : ""}</div>
        {meta && <div className={cx("pp-participant__meta", `pp-participant__meta--${tone}`)}>{meta}</div>}
      </div>
      {actions && <div className="pp-participant__actions">{actions}</div>}
    </li>
  );
}

/** Results grid. Stacks into labelled blocks below 640px rather than scrolling
    sideways; the data-label on each cell is what the stacked row echoes. */
export function ResultsTable({ columns, rows, caption, stack = true, className }) {
  return (
    <div className="pp-table-wrap">
      <table className={cx("pp-table", "pp-table--card", stack && "pp-table--stack", className)}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {/* hideLabel is for an action column, where the heading is already
                said by every button under it. The word is hidden, not dropped:
                it is still the column's name for a screen reader, and it is
                still what the stacked layout prints in front of each cell —
                which is the one place it is not redundant. */}
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "pp-num" : undefined} scope="col">
                {c.hideLabel ? <span className="pp-visually-hidden">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.numeric ? "pp-num" : undefined}>{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Feedback ───────────────────────────────────────────────────────────── */

const ALERT_GLYPH = { info: "i", success: "✓", warning: "!", danger: "!", gold: "♦" };

/** An inline message with its own surface, border and icon disc — the thing
    the old build lacked, which is how it kept losing its own error text. */
export function Alert({ tone = "info", title, children, actions, className, ...rest }) {
  return (
    <div
      className={cx("pp-alert", tone !== "info" && `pp-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
      {...rest}
    >
      <span className="pp-alert__icon" aria-hidden="true">{ALERT_GLYPH[tone]}</span>
      <div className="pp-alert__body">
        {title && <span className="pp-alert__title">{title}</span>}
        {children && <span className="pp-alert__text">{children}</span>}
        {actions && <div className="pp-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ToastRegion({ children }) {
  return (
    <div className="pp-toast-region" role="region" aria-live="polite" aria-label="Notifications">
      {children}
    </div>
  );
}

export function Toast({ tone = "default", text, sub, onDismiss }) {
  return (
    <div className={cx("pp-toast", tone !== "default" && `pp-toast--${tone}`)}>
      <span />
      <div>
        <div className="pp-toast__text">{text}</div>
        {sub && <div className="pp-toast__sub">{sub}</div>}
      </div>
      {onDismiss && <IconButton icon="close" label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}

/** A bar. `tone` recolours the fill: "success" | "warning" | "neutral", or
    omitted for the default gold. Colour never carries the meaning on its own —
    every caller also states the number beside it. */
export function Progress({ value, max = 100, label, tall = false, tone, className }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx("pp-progress", tall && "pp-progress--tall", tone && `pp-progress--${tone}`, className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="pp-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ variant = "text", width, style, className }) {
  return <div className={cx(`pp-skeleton pp-skeleton--${variant}`, className)} style={{ width, ...style }} aria-hidden="true" />;
}

/** One line explaining what will appear here. Never three zeroes. */
export function EmptyState({ title, children, action, className }) {
  return (
    <div className={cx("pp-empty", className)}>
      <p className="pp-empty__title">{title}</p>
      {children && <p className="pp-empty__text">{children}</p>}
      {action}
    </div>
  );
}

export function Timer({ secondsLeft, total, label, urgent, className }) {
  const p = total ? Math.max(0, secondsLeft / total) : 0;
  const isUrgent = urgent ?? secondsLeft <= 10;
  return (
    <div className={cx("pp-timer", isUrgent && "pp-timer--urgent", className)}>
      <div className="pp-timer__ring" style={{ "--timer-progress": p }}>
        {/* The countdown updates every second. Announcing every tick would make
            the room unusable on a screen reader, so the ring is silent and the
            label carries the meaning. */}
        <span className="pp-timer__face" data-numeric aria-hidden="true">{secondsLeft}</span>
      </div>
      {label && <span className="pp-timer__label">{label}</span>}
      <span className="pp-visually-hidden" role="timer">
        {secondsLeft} seconds left{isUrgent ? ", nearly up" : ""}
      </span>
    </div>
  );
}

/* ── Navigation ─────────────────────────────────────────────────────────── */

/**
 * Tabs. The selected tab is marked four ways at once — weight, colour, a 3px
 * brass bar and a tint — because a colour shift alone gets missed.
 *
 * Arrow keys move between tabs and only the selected tab is in the tab order,
 * which is what the tablist pattern requires: Tab should step past the whole
 * strip, not through every tab in it.
 */
export function Tabs({ tabs, value, onChange, fill = false, ariaLabel, className }) {
  const stripRef = useRef(null);

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.value === value);
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange && onChange(tabs[next].value);
    stripRef.current?.querySelectorAll("[role=tab]")[next]?.focus();
  };

  return (
    <div ref={stripRef} className={cx("pp-tabs", fill && "pp-tabs--fill", className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            className="pp-tab"
            aria-selected={selected}
            aria-controls={`panel-${t.value}`}
            id={`tab-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange && onChange(t.value)}
          >
            {t.label}
            {t.count !== undefined && <span className="pp-tab__count" data-numeric>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ value, active, children }) {
  if (value !== active) return null;
  return (
    <div className="pp-tabpanel" role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0}>
      {children}
    </div>
  );
}

/** Disclosure list. Carries the FAQ blocks that hold most of the SEO copy, so
    the answers stay in the DOM — a crawler does not click. */
export function Accordion({ items, allowMultiple = false, className }) {
  const [open, setOpen] = useState([]);
  const base = useId();
  const toggle = (i) =>
    setOpen((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : allowMultiple ? [...cur, i] : [i]));
  return (
    <div className={cx("pp-accordion", className)}>
      {items.map((it, i) => {
        const isOpen = open.includes(i);
        const panelId = `${base}-acc-${i}`;
        return (
          <div className="pp-accordion__item" key={it.question}>
            <h3 style={{ margin: 0, font: "inherit" }}>
              <button
                type="button"
                className="pp-accordion__trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                id={`${panelId}-trigger`}
                onClick={() => toggle(i)}
              >
                <span>{it.question}</span>
                <span className="pp-accordion__chevron" aria-hidden="true" />
              </button>
            </h3>
            {/* hidden rather than unmounted: the answer text stays crawlable. */}
            <div className="pp-accordion__panel" id={panelId} role="region" aria-labelledby={`${panelId}-trigger`} hidden={!isOpen}>
              {it.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Site and app bar. One primary action in the bar, ever. */
export function Header({ links = [], current, cta, trust, onJoinScreen = false, themeToggle = true, className }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <header className={cx("pp-header", className)}>
      <div className="pp-header__inner">
        <Logo href="/" size="sm" />
        <nav className="pp-nav" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} className="pp-nav__link" href={l.href} aria-current={l.href === current ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="pp-header__actions">
          {trust && <span className="pp-header__trust">{trust}</span>}
          {themeToggle && <ThemeToggle />}
          {cta && <Button variant={onJoinScreen ? "secondary" : "primary"} size="sm" href={cta.href}>{cta.label}</Button>}
          <span className="pp-nav-toggle">
            <IconButton
              icon={open ? "close" : "list"}
              label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
            />
          </span>
        </div>
      </div>
      {open && (
        <div className="pp-nav-panel" id={panelId}>
          {links.map((l) => (
            <a key={l.href} className="pp-nav__link" href={l.href} aria-current={l.href === current ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

export function Footer({ columns = [], tagline, legal, className }) {
  return (
    <footer className={cx("pp-footer", className)}>
      <div className="pp-footer__inner">
        <div className="pp-footer__cols">
          <div className="pp-footer__brand">
            <Logo onFelt href="/" />
            {tagline && <p className="pp-footer__tagline">{tagline}</p>}
          </div>
          {columns.map((c) => (
            <div key={c.heading}>
              <h2 className="pp-footer__heading">{c.heading}</h2>
              <ul className="pp-footer__list">
                {c.links.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="pp-footer__base">{legal}</div>
      </div>
    </footer>
  );
}

/* ── Overlays ───────────────────────────────────────────────────────────── */

/**
 * Called by whatever opens a dialog, immediately before it opens.
 *
 * Reading document.activeElement from inside the dialog's own effect is too
 * late: React has already committed the render, and an autoFocus anywhere on
 * the page behind it has moved focus by then — so the dialog would record the
 * wrong element and return the keyboard to the wrong place.
 */
let _dialogOpener = null;
export function rememberDialogOpener() {
  const el = typeof document === "undefined" ? null : document.activeElement;
  _dialogOpener = el instanceof HTMLElement && el !== document.body ? el : null;
}

/**
 * Everything a dialog owes a keyboard: focus moves in on open and back to
 * whatever opened it on close, Escape dismisses, Tab cannot walk out into the
 * page behind, and the page behind does not scroll.
 *
 * Without this a modal is a div that looks like a dialog — the screen reader
 * carries on reading the room underneath it.
 *
 * Returns [ref, requestClose]. Close through `requestClose`, never through
 * `onClose` directly: it restores focus *before* the dialog unmounts. Doing it
 * in the effect cleanup instead races the commit — the focused node is removed,
 * the browser resets focus to <body>, and the restore lands on nothing.
 */
function useDialog(open, onClose) {
  const ref = useRef(null);
  const returnTo = useRef(null);

  /* onClose is almost always an inline arrow, so it is a new function on every
     render. Holding it in a ref keeps it out of the effect's dependencies —
     otherwise the effect tears down and re-runs on every keystroke, and the
     opener gets re-captured as whatever is focused inside the dialog. That is
     how "focus returns to the trigger" quietly becomes "focus returns to the
     body". */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* Captured once per opening. StrictMode double-invokes effects in
     development, and re-capturing on the second pass would record the dialog's
     own first control as the thing to return focus to. */
  if (open && returnTo.current === null) {
    returnTo.current = _dialogOpener || (typeof document === "undefined" ? null : document.activeElement);
  }

  const restoreFocus = useCallback(() => {
    const opener = returnTo.current;
    returnTo.current = null;
    if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus();
  }, []);

  const requestClose = useCallback(() => {
    restoreFocus();
    onCloseRef.current && onCloseRef.current();
  }, [restoreFocus]);

  useEffect(() => {
    if (!open) return undefined;

    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, summary, [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    (node?.querySelector("[data-autofocus]") || focusables()[0] || node)?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      /* Fallback for a dialog closed by something other than requestClose —
         a route change, say. A no-op when requestClose already ran, because it
         clears the ref before it focuses. */
      restoreFocus();
    };
    // Both callbacks are stable; onClose is read through a ref on purpose.
  }, [open, requestClose, restoreFocus]);

  return [ref, requestClose];
}

/** Bottom sheet under 560px, centred box above it. */
export function Modal({ open, title, subtitle, children, footer, wide = false, className, onClose }) {
  const [ref, close] = useDialog(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <>
      <div className="pp-scrim" onClick={close} />
      <div className="pp-modal-layer">
        <div
          ref={ref}
          className={cx("pp-modal", wide && "pp-modal--wide", className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className="pp-modal__head">
            <div>
              <h2 className="pp-modal__title" id={titleId}>{title}</h2>
              {subtitle && <p className="pp-modal__sub">{subtitle}</p>}
            </div>
            <IconButton icon="close" label="Close" onClick={close} />
          </div>
          <div className="pp-modal__body">{children}</div>
          {footer && <div className="pp-modal__footer">{footer}</div>}
        </div>
      </div>
    </>
  );
}

/* Drawer and ActionBar were exported from here and rendered by nothing. See the
   note where their CSS used to live in components.css. */

/* ── Layout primitives ──────────────────────────────────────────────────── */

/** The centred measure. A page sets its width here and nowhere else.
    `flow` puts one gap — `--block-y` — between every block inside it. */
export function Container({ size, flow = false, as = "div", children, className, ...rest }) {
  const Tag = as;
  return (
    <Tag className={cx("pp-container", size && `pp-container--${size}`, flow && "pp-flow", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A band: edge to edge, owns the background and the vertical rhythm. Put a
    Container inside it — a Section never carries the page width itself. */
export function Section({ variant, tight = false, flow = false, as = "section", children, className, ...rest }) {
  const Tag = as;
  return (
    <Tag className={cx("pp-section", tight && "pp-section--tight", flow && "pp-flow", variant && `pp-section--${variant}`, className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Stack({ gap, children, className, ...rest }) {
  return <div className={cx("pp-stack", gap && `pp-stack--${gap}`, className)} {...rest}>{children}</div>;
}

export function Row({ between = false, end = false, nowrap = false, children, className, ...rest }) {
  return (
    <div className={cx("pp-row", between && "pp-row--between", end && "pp-row--end", nowrap && "pp-row--nowrap", className)} {...rest}>
      {children}
    </div>
  );
}

/** The auto-fit grid every card deck in the product comes off. Set `min` in
    place of writing per-breakpoint column counts. */
export function Grid({ min, size, children, className, ...rest }) {
  return (
    <div
      className={cx("pp-grid", size && `pp-grid--${size}`, className)}
      style={min ? { "--grid-min": min } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Prose({ children, className, ...rest }) {
  return <div className={cx("pp-prose", className)} {...rest}>{children}</div>;
}

export function Eyebrow({ children, className, ...rest }) {
  return <span className={cx("pp-eyebrow", className)} {...rest}>{children}</span>;
}

/** A band heading. Centred, because that is what a heading over a full-width
    band should be; pass `align="start"` where it heads a panel or a column
    rather than a band, and it takes that content's axis instead. */
export function SectionHead({ eyebrow, title, subtitle, as = "h2", align = "center", className }) {
  const Tag = as;
  return (
    <div className={cx("pp-section-head", align === "start" && "pp-section-head--start", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Tag className="pp-section-head__title">{title}</Tag>
      {subtitle && <p className="pp-section-head__sub">{subtitle}</p>}
    </div>
  );
}

export function Divider({ gold = false, className }) {
  return <hr className={cx("pp-divider", gold && "pp-divider--gold", className)} />;
}

export function VisuallyHidden({ as = "span", children, ...rest }) {
  const Tag = as;
  return <Tag className="pp-visually-hidden" {...rest}>{children}</Tag>;
}

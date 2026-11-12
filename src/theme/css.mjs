/**
 * Turns a colour card into CSS for the ZCode desktop renderer.
 *
 * Two layers:
 *
 * 1. **Tokens.** ZCode is Tailwind v4; its UI reads semantic `--color-*`
 *    variables declared in `:root` (light), `.dark` (dark) and the two named
 *    themes `.theme-zai-light` / `.theme-zai-dark`. We override them with
 *    `!important` so the skin wins whichever theme class the app has put on
 *    `<html>`, and we also remap the raw neutral ramps so utilities that hard
 *    code `bg-neutral-100` / `dark:text-zinc-300` follow the card instead of
 *    staying stone cold gray.
 *
 * 2. **Shape.** The radius ladder, the serif display face, thin scrollbars,
 *    the flat composer shadow and the link/code treatments that make the look
 *    read as editorial rather than as a dashboard.
 */

import { CARDS, DURATION, LITERAL, RADII, tones } from "./palette.mjs";
export { motionCss } from "./motion.mjs";

/**
 * Semantic ZCode token → tone key.
 * Left column names come from the app's own stylesheet (296 `--color-*`);
 * right column names are the card's tones (see palette.mjs).
 */
const TOKEN_MAP = [
  // window / page
  ["--color-background", "canvas"],
  ["--color-background-alt", "surface-1"],
  ["--color-background-win-alt", "surface-1"],
  ["--color-panel", "sidebar"],
  ["--color-sidebar", "sidebar"],
  ["--color-header", "surface-1"],
  // surfaces
  ["--color-card", "card"],
  ["--color-card-selected", "hover-plate"],
  ["--color-card-border", "border-1"],
  ["--color-surface", "hover-wash"],
  ["--color-surface-hover", "hover-plate"],
  ["--color-hover", "hover-plate"],
  ["--color-selected", "hover-wash"],
  ["--color-menu", "overlay"],
  ["--color-menu-hover", "hover-plate"],
  ["--color-popover", "overlay"],
  ["--color-popover-border", "border-2"],
  ["--color-popover-foreground", "ink"],
  ["--color-toast", "overlay"],
  ["--color-tooltip", "overlay"],
  ["--color-tooltip-foreground", "ink"],
  ["--color-tooltip-tag", "chip"],
  ["--color-tooltip-tag-foreground", "ink-2"],
  // fields
  ["--color-input", "surface-1"],
  ["--color-input-focused", "canvas"],
  ["--color-input-border", "border-1"],
  ["--color-input-border-hover", "border-2"],
  ["--color-input-border-focused", "accent"],
  // ink
  ["--color-foreground", "ink"],
  ["--color-foreground-subtle", "ink-2"],
  ["--color-foreground-subtlest", "ink-3"],
  ["--color-foreground-inverse", "inverse-ink"],
  ["--color-primary", "ink"],
  ["--color-primary-foreground", "canvas"],
  ["--color-secondary", "chip"],
  ["--color-tag", "chip"],
  // accent
  ["--color-brand", "accent"],
  ["--color-accent", "accent-tint"],
  // rules
  ["--color-border", "border-1"],
  ["--color-border-hover", "border-2"],
  ["--color-resize-handle", "accent"],
  // content
  ["--color-user-message-bubble", "bubble"],
  ["--color-markdown-inline-code", "code-wash"],
  ["--color-idle-task", "ui-link"],
  ["--color-idle-task-surface", "accent-tint"],
  ["--color-progress-surface", "accent-tint"],
  ["--color-progress-surface-foreground", "ui-link"],
  ["--color-feedback-privacy-hint", "ink-3"],
  // terminal follows the canvas rather than the host's stone ramp
  ["--color-terminal-bg", "canvas"],
  ["--color-terminal-fg", "ink"],
  ["--color-terminal-black", "ink-2"],
  ["--color-terminal-white", "ink-3"],
  ["--color-terminal-cursor", "ink"],
  ["--color-terminal-cursor-accent", "canvas"],
  ["--color-terminal-selection", "accent-active"],
  ["--color-terminal-selection-inactive", "accent-tint"],
];

/**
 * Tailwind Typography's own palette. ZCode ships `.prose` with hard-coded
 * `--tw-prose-*` oklch values, so headings, quotes and code ink ignore the
 * semantic tokens entirely — leave these alone and dark mode renders black
 * headings on a near-black canvas.
 *
 * These must be declared **on `.prose` itself**, not on `html`: a custom
 * property declared on the element beats the one inherited from an ancestor,
 * no matter that the ancestor's carries `!important`. Declaring them on `html`
 * looks correct and does nothing.
 *
 * Both families are written with the current scheme's tones: the skin swaps the
 * whole stylesheet when the app changes scheme, so `prose-invert` inside a
 * light UI is never a case we have to carry.
 */
function proseBlock(t) {
  const map = {
    body: t.ink,
    headings: t.ink,
    lead: t["ink-2"],
    links: t.link,
    bold: t.ink,
    counters: t["ink-3"],
    bullets: t["ink-4"],
    hr: t["border-1"],
    quotes: t["ink-2"],
    "quote-borders": t["border-2"],
    captions: t["ink-3"],
    kbd: t.ink,
    code: t["inline-code-fg"],
    "pre-bg": t["code-block"],
    "pre-code": t.ink,
    "th-borders": t["border-2"],
    "td-borders": t["border-1"],
    "kbd-shadows": "0 0 0 1px rgba(0, 0, 0, 0.08) inset",
  };
  const lines = [];
  for (const [key, value] of Object.entries(map)) {
    lines.push(`  --tw-prose-${key}: ${value} !important;`);
    lines.push(`  --tw-prose-invert-${key}: ${value} !important;`);
  }
  return `.prose, .prose-invert, [class*="prose"] {\n${lines.join("\n")}\n}`;
}

/**
 * `#rrggbb` → `rgba(...)`. The card tones are literals, so a simple split beats
 * pulling in a colour library for seven calls.
 */
function alpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Semantic tokens the card paints with its own private rungs. */
function extraTokens(t, scheme) {
  return {
    "--color-workflow-rule": t["border-1"],
    "--color-workflow-trace": t["ink-4"],
    "--color-workflow-trace-strong": t["ink-3"],
    "--color-find-highlight":
      scheme === "dark" ? "rgba(250, 178, 25, 0.28)" : "#fde68a",
    "--color-find-highlight-active":
      scheme === "dark" ? "rgba(250, 178, 25, 0.45)" : "#facc15",
    // Private tokens: surfaces the skin owns (mascot plate, panel chrome).
    "--zcs-card": t.card,
    "--zcs-sidebar": t.sidebar,
    "--zcs-divider": t.divider,
    "--zcs-hover-plate": t["hover-plate"],
    "--zcs-bubble": t.bubble,
    "--zcs-ink": t.ink,
    "--zcs-ink-2": t["ink-2"],
    "--zcs-ink-3": t["ink-3"],
    "--zcs-link": t.link,
    "--zcs-code-wash": t["code-wash"],
    "--zcs-inline-code-fg": t["inline-code-fg"],
    "--zcs-shadow": t["shadow-lv2"],
    "--zcs-scrollbar": t.scrollbar,
    "--zcs-scrollbar-hover": t["scrollbar-hover"],
    "--zcs-status-unread": LITERAL["status-unread"],
    "--zcs-status-awaiting": LITERAL["status-awaiting"],
    "--zcs-status-running": LITERAL["status-running"],
    "--zcs-focus-ring":
      scheme === "dark" ? LITERAL["focus-ring-dark"] : LITERAL["focus-ring-light"],
    "--zcs-duration-instant": DURATION.instant,
    "--zcs-duration-feedback": DURATION.feedback,
    "--zcs-duration-reveal": DURATION.reveal,
    "--zcs-duration-enter": DURATION.enter,
    "--zcs-duration-surface": DURATION.surface,
    "--zcs-duration-exit": DURATION.exit,
    /*
     * Motion layer tones. The sweep is the host's own `background-clip: text`
     * gradient (.animated-gradient-text) — we only hand it a warm band instead
     * of the host's translucent black/white. Alpha is scheme-tuned: on canvas
     * white a 40% accent band already reads as a glow, while on #191919 it needs
     * to be denser to survive the 5.6:1 text contrast next to it.
     */
    "--zcs-accent": t.accent,
    "--zcs-accent-hover": t["accent-hover"],
    "--zcs-on-accent": t["on-accent"],
    "--zcs-shimmer-soft": alpha(t.accent, scheme === "dark" ? 0.52 : 0.4),
    "--zcs-shimmer-glow": alpha(t.accent, scheme === "dark" ? 0.45 : 0.3),
    "--zcs-scan-duration": "2800ms",
  };
}

/**
 * Raw Tailwind ramps. Components reach past the semantic tokens often enough
 * that leaving the grays alone leaves half the app gray. Each rung is mapped
 * onto the card's own ladder, so a hard coded `bg-neutral-100` lands on the
 * sidebar tone rather than on #f5f5f5.
 */
function rampTokens(t, scheme) {
  const dark = scheme === "dark";
  const scratch = dark ? t["surface-1"] : t["table-head"];
  return {
    // neutral: canvas → ink
    "--color-neutral-50": dark ? t["ink"] : t.canvas,
    "--color-neutral-100": dark ? t["surface-3"] : t.sidebar,
    "--color-neutral-200": dark ? t["surface-3"] : t["hover-plate"],
    "--color-neutral-300": dark ? t["ink-2"] : t["border-2"],
    "--color-neutral-500": dark ? t["ink-3"] : t["ink-3"],
    "--color-neutral-700": dark ? t["surface-2"] : t["ink"],
    "--color-neutral-800": dark ? t["surface-2"] : t["ink"],
    "--color-neutral-900": dark ? t.canvas : t["inverse-fill"],
    "--color-neutral-950": dark ? t["ink"] : t["ink"],
    // zinc / gray / slate: the same ladder, so mixed utility sets stay one family
    "--color-zinc-950": dark ? t["ink"] : t["ink"],
    "--color-zinc-800": dark ? t["surface-2"] : t["ink-2"],
    "--color-zinc-500": t["ink-3"],
    "--color-zinc-400": t["ink-3"],
    "--color-zinc-300": dark ? t["ink-2"] : t["border-2"],
    "--color-zinc-100": dark ? t["surface-2"] : t.sidebar,
    "--color-gray-900": dark ? t["ink"] : t["ink"],
    "--color-gray-700": dark ? t["ink-2"] : t["ink-2"],
    "--color-gray-400": t["ink-3"],
    "--color-gray-100": dark ? t["surface-2"] : t.sidebar,
    "--color-slate-900": dark ? t["ink"] : t["ink"],
    "--color-slate-700": dark ? t["ink-2"] : t["ink-2"],
    "--color-slate-300": dark ? t["ink-2"] : t["border-2"],
    "--color-slate-200": dark ? t["surface-3"] : t["border-1"],
    "--color-slate-500": t["ink-3"],
    "--color-slate-50": dark ? t["surface-1"] : t.canvas,
    // the skin's own scratch fills
    "--color-white": dark ? t["ink"] : "#fff",
    "--color-black": dark ? t.canvas : t["ink"],
    "--zcs-scratch": scratch,
  };
}

function declarations(map) {
  return Object.entries(map)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join("\n  ");
}

/**
 * Custom properties accept `!important`, and an important declaration beats
 * the app's own `.dark` / `.theme-zai-*` blocks whatever their specificity.
 * `html` is used rather than `:root` so an injected `<style>` in `<head>`
 * cannot be shadowed by a later `:root` rule.
 */
function tokenBlock(card, scheme) {
  const entry = CARDS[card] ?? CARDS.claude;
  const t = tones(card, scheme);
  const map = {
    ...Object.fromEntries(TOKEN_MAP.map(([token, key]) => [token, t[key]])),
    ...extraTokens(t, scheme),
    ...rampTokens(t, scheme),
    "--zcs-card-name": `"${entry.label}"`,
    "--zcs-card-accent": entry.accent,
  };
  return `html {
  color-scheme: ${scheme};
  ${declarations(map)}
}`;
}

/**
 * Emitted once per injection, independently of the card: swapping the colour
 * card must not re-download the faces.
 */
export function buildFontFaceCss(fonts) {
  if (!fonts) return "";
  const faces = [];
  if (fonts.sans) {
    faces.push(`@font-face {
  font-family: "ZCS Inter";
  src: url(${fonts.sans}) format("woff2");
  font-weight: 100 900;
  font-display: swap;
}`);
  }
  if (fonts.serif) {
    faces.push(`/* Source Serif 4: variable wght 200-900 plus an opsz 8-60 axis, which is
   what lets large text use the tighter optical cut instead of a scaled-up one. */
@font-face {
  font-family: "ZCS Serif";
  src: url(${fonts.serif}) format("woff2");
  font-weight: 200 900;
  font-display: swap;
}`);
  }
  if (fonts.mono) {
    faces.push(`@font-face {
  font-family: "ZCS Mono";
  src: url(${fonts.mono}) format("woff2");
  font-weight: 100 800;
  font-display: swap;
}`);
  }
  return faces.join("\n");
}

function typography(useFonts) {
  const sans = useFonts
    ? `"ZCS Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif`
    : `ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif`;
  const mono = useFonts
    ? `"ZCS Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
    : `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

  return `html {
  --font-sans: ${sans} !important;
  --font-mono: ${mono} !important;
  --font-weight-normal: 400 !important;
  --font-weight-medium: 500 !important;
  --font-weight-semibold: 600 !important;
  --font-weight-bold: 620 !important;
  /* shape ladder: 4 / 6 / 8 / 12 / 16, flatter than the host's dashboard */
  --radius-xs: ${RADII.xs} !important;
  --radius-sm: ${RADII.sm} !important;
  --radius-md: ${RADII.md} !important;
  --radius-lg: ${RADII.lg} !important;
  --radius-xl: ${RADII.lg} !important;
  --radius-2xl: ${RADII.lg} !important;
  --radius-3xl: 24px !important;
}

/*
 * Heading voice: weight and a touch of negative tracking. The face is whatever
 * --font-sans resolves to, so these two declarations hold for both Inter and the
 * opt-in serif — flipping the switch never shifts a line.
 */
.prose :is(h1, h2, h3, h4, h5, h6),
[class*="prose-h"] {
  font-weight: 600 !important;
  letter-spacing: -0.011em;
}

/* The composer's own soft drop shadow reads as a dashboard card; the look
   wants a flat plate with a hairline instead. */
html {
  --shadow-composer-soft: none !important;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
  --shadow-md: 0 2px 6px rgba(0, 0, 0, 0.05) !important;
  --shadow-lg: var(--zcs-shadow) !important;
}`;
}

/**
 * Whole-interface serif, shipped as its own style element so the settings page
 * can unmount it without rebuilding the four colour sheets — the same
 * arrangement the motion layer uses.
 *
 * It is one variable on purpose: ZCode's chrome (headings, labels, the composer,
 * prose) all inherit `--font-sans`, and the app declares no `--font-serif`. So
 * swapping that single token converts the entire interface, and `--font-mono`
 * stays untouched — code keeps its alignment, which no serif face survives.
 *
 * Ordering matters: both this and the colour sheet declare `--font-sans` with
 * `!important`, so the later element wins. The runtime appends this sheet after
 * `#zcs-theme`, which is exactly what we want.
 */
export function serifCss(useFonts = true) {
  const latin = useFonts ? `"ZCS Serif", ` : "";
  return `/* The pairing, translated to open faces: a transitional serif for Latin
   (Source Serif 4) and Noto Serif SC for Chinese. The CJK entry is the part
   that used to be missing entirely — without it Windows fell all the way
   through to SimSun, which is what made the serif read as cheap. */
html {
  --font-sans: ${latin}"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif !important;
  /* Let the optical-size axis do its job: larger text takes the tighter,
     more delicate cut instead of the same shapes scaled up. */
  font-optical-sizing: auto;
}

/*
 * Retinal-bloom compensation, lifted from Claude's variable-font setup: white
 * text on a dark ground reads 10-15% heavier than the same weight on paper, so
 * the axis is pulled back about 40 units in the dark scheme.
 *
 * This only works because every face here is variable. A static face would snap
 * to the nearest master and the compensation would be a no-op.
 *
 * Bold is deliberately left alone: Claude raises it (600 -> 660) because its
 * base is 600, while ours is already 620 and sits at the safe end.
 */
html.dark {
  --font-weight-normal: 360 !important;
  --font-weight-medium: 460 !important;
  --font-weight-semibold: 550 !important;
}`;
}

function surfaces() {
  return `/* Hairline plate on the input, matching the card's border rung. */
.chat-composer-input-surface,
.highspeed-composer-surface {
  border-color: var(--zcs-divider) !important;
  box-shadow: none !important;
  background-color: var(--color-input) !important;
}

/* Inline code reads as a wash with the card's own ink, never a gray chip. */
.prose code:not(pre code) {
  background-color: var(--zcs-code-wash) !important;
  color: var(--zcs-inline-code-fg) !important;
  border-radius: ${RADII.xs} !important;
  padding: 0.1em 0.32em;
}

/* Fenced blocks sit on the raised rung, hairline only in light. */
.prose pre {
  background-color: var(--tw-prose-pre-bg, var(--zcs-scratch)) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: ${RADII.md} !important;
}

/* Markdown links: the card's link ink with a light underline, not the accent. */
.prose a {
  color: var(--zcs-link) !important;
  text-decoration-color: color-mix(in srgb, var(--zcs-link) 45%, transparent);
  text-underline-offset: 0.18em;
}
.prose a:hover {
  color: var(--color-link, var(--zcs-link)) !important;
  text-decoration-color: color-mix(in srgb, var(--zcs-link) 80%, transparent);
}

/* Dividers are a rung below the lightest border. */
hr {
  border-color: var(--zcs-divider) !important;
}

/* Thin, self-effacing scrollbars. */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--zcs-scrollbar) transparent;
}
*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background-color: var(--zcs-scrollbar);
  border: 3px solid transparent;
  background-clip: content-box;
  border-radius: ${RADII.pill};
}
*::-webkit-scrollbar-thumb:hover {
  background-color: var(--zcs-scrollbar-hover);
}

::selection {
  background: var(--color-accent);
  color: var(--color-foreground);
}

/* Keyboard focus is the host's ring at the card's own ink weight. */
:focus-visible {
  outline-color: var(--zcs-focus-ring) !important;
}

/* Waiting / unread / running stay literal across cards. */
[data-zcs-status="unread"] {
  background-color: var(--zcs-status-unread) !important;
}
[data-zcs-status="awaiting"] {
  background-color: var(--zcs-status-awaiting) !important;
}
[data-zcs-status="running"] {
  background-color: var(--zcs-status-running) !important;
}`;
}

/** The sidebar row is host markup, so only its active state needs paint. */
function navRowCss() {
  return `[data-zcs-nav][data-zcs-active="1"] {
  background-color: var(--color-hover) !important;
  color: var(--color-foreground) !important;
}`;
}

function mascotCss() {
  return `#zcs-mascot {
  position: fixed;
  /* Fallback spot at the composer's right end, used until the anchor is
     measurable (the runtime then follows the real composer). */
  left: auto;
  right: 62px;
  top: calc(100vh - 210px);
  z-index: 2147483000;
  width: 96px;
  height: 96px;
  pointer-events: none;
  transform: translate(-50%, -100%);
  transition: opacity var(--zcs-duration-surface) ease;
  opacity: 0;
}
#zcs-mascot[data-visible="1"] {
  opacity: 1;
}
#zcs-mascot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.10));
}
@media (prefers-reduced-motion: reduce) {
  #zcs-mascot { transition: none; }
}`;
}

/** The settings page's shadow stylesheet; rides the payload so it updates live. */
export function buildPanelCss() {
  return `
    :host {
      all: initial;
      position: fixed;
      left: 264px; top: 0; right: 0; bottom: 0;
      z-index: 2147483000;
      display: block;
      background: var(--color-background, #fff);
      color: var(--color-foreground, #161616);
      font-family: var(--font-sans, system-ui, -apple-system, "Microsoft YaHei UI", sans-serif);
      font-size: 13px;
      line-height: 1.55;
      border-left: 1px solid var(--zcs-divider);
    }
    * { box-sizing: border-box; }
    .page { display: flex; flex-direction: column; height: 100%; }
    header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 22px;
      border-bottom: 1px solid var(--zcs-divider);
    }
    .back {
      width: 26px; height: 26px; border-radius: 8px; flex: none;
      border: 1px solid transparent; background: transparent;
      color: var(--zcs-ink-2); cursor: pointer; font-size: 15px; line-height: 1;
      display: grid; place-items: center;
      transition: background-color var(--zcs-duration-feedback) ease,
                  color var(--zcs-duration-feedback) ease;
    }
    .back:hover { background: var(--zcs-hover-plate); color: var(--zcs-ink); }
    header h1 {
      margin: 0;
      /* Follows --font-sans (custom properties cross the shadow boundary), so
         the page title matches whatever face the skin is currently using. */
      font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
      font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
      color: var(--zcs-ink);
    }
    .tag { margin-left: auto; font-size: 11px; color: var(--zcs-ink-3); }

    .body { flex: 1; overflow: auto; padding: 24px 22px 48px; }
    .body::-webkit-scrollbar { width: 10px; }
    .body::-webkit-scrollbar-thumb {
      background-color: var(--zcs-scrollbar); border: 3px solid transparent;
      background-clip: content-box; border-radius: 999px;
    }
    section { max-width: 680px; margin: 0 auto 30px; }
    section h2 {
      margin: 0 0 10px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--zcs-ink-3);
    }

    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .swatch {
      display: flex; flex-direction: column; gap: 10px; padding: 12px;
      border-radius: 12px; border: 1px solid var(--zcs-divider);
      background: var(--zcs-card); cursor: pointer; text-align: left;
      transition: border-color var(--zcs-duration-feedback) ease,
                  box-shadow var(--zcs-duration-feedback) ease;
    }
    .swatch:hover { border-color: var(--zcs-ink-3); }
    .swatch[data-on="1"] {
      border-color: var(--zcs-card-accent);
      box-shadow: inset 0 0 0 1px var(--zcs-card-accent);
    }
    .sw-name { font-size: 12.5px; font-weight: 600; color: var(--zcs-ink); }
    .sw-row { display: flex; gap: 6px; }
    .sw-chip { width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--zcs-divider); }
    .sw-chip[data-chip="canvas"] { background: var(--chip-canvas, transparent); }
    .sw-chip[data-chip="sidebar"] { background: var(--chip-sidebar, transparent); }
    .sw-chip[data-chip="accent"] { background: var(--chip-accent, transparent); }
    .sw-chip[data-chip="ink"] { background: var(--chip-ink, transparent); }
    .note { margin: 10px 0 0; font-size: 11.5px; color: var(--zcs-ink-3); }

    .row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding: 12px 0; border-top: 1px solid var(--zcs-divider);
    }
    section .row:last-child { border-bottom: 1px solid var(--zcs-divider); }
    .row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .t { font-size: 12.5px; color: var(--zcs-ink); }
    .s { font-size: 11.5px; color: var(--zcs-ink-3); }
    .value { font-size: 11.5px; color: var(--zcs-ink-2); flex: none; }

    .sw {
      width: 34px; height: 19px; border-radius: 999px; flex: none;
      border: 1px solid var(--zcs-divider); background: transparent;
      cursor: pointer; position: relative;
      transition: background-color var(--zcs-duration-feedback) ease;
    }
    .sw::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 13px; height: 13px; border-radius: 999px;
      background: var(--zcs-ink-3);
      transition: transform var(--zcs-duration-feedback) ease,
                  background-color var(--zcs-duration-feedback) ease;
    }
    .sw[data-on="1"] { background: var(--zcs-card-accent); border-color: transparent; }
    .sw[data-on="1"]::after { transform: translateX(15px); background: #fff; }

    .text-btn {
      border: 0; background: transparent; color: var(--zcs-link);
      font-size: 12px; cursor: pointer; padding: 0; flex: none;
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
    }
    .text-btn:hover { text-decoration-color: currentColor; }

    @media (max-width: 720px) {
      .cards { grid-template-columns: 1fr; }
    }
  `;
}

/**
 * @param {object} opts
 * @param {"claude"|"deepseek"} opts.card
 * @param {import("./palette.mjs").Scheme} opts.scheme
 * @param {boolean} [opts.mascot]
 * @param {boolean} [opts.panel]
 * @param {boolean} [opts.useFonts] true when the face block was injected too
 */
export function buildCss(opts) {
  const {
    card = "claude",
    scheme = "light",
    mascot = true,
    panel = true,
    useFonts = false,
  } = opts;
  return [
    tokenBlock(card, scheme),
    proseBlock(tones(card, scheme)),
    typography(useFonts),
    surfaces(),
    mascot ? mascotCss() : "",
    panel ? navRowCss() : "",
    // Motion ships in its own style element (see motionCss) so the settings
    // page can toggle it live without rebuilding the skin's colour sheet.
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The stylesheet without fonts — small enough to inline in tests. */
export function buildCssNoFonts(opts) {
  return buildCss({ ...opts, useFonts: false });
}

export { TOKEN_MAP };

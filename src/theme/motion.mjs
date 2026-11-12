
/**
 * Motion layer — the CSS-only tier.
 *
 * The host already owns content entrance: `[data-zcode-reveal]` fades in over
 * `--zcode-reveal-duration` and streamed text uses `zcode-stream-text-in` over
 * `--zcode-enter-duration` (0.26s, cubic-bezier(.16,1,.3,1) — essentially the
 * same spring feel dsh uses at 320ms). We therefore never animate message
 * content ourselves; we only retime the host's own knobs and fill the gaps it
 * leaves: control feedback, floating surfaces, hover/press.
 *
 * Nothing here touches the DOM, so React re-renders cannot break it and a
 * failing rule degrades to "no transition" rather than to a broken layout.
 */
export function motionCss() {
  return `/* ---- timing knobs: retime the host, do not replace it ---- */
html {
  /* dsh: instant 80 · feedback 120 · reveal 120 · enter 320 · surface 150 · exit 120 */
  --zcs-ease-out: cubic-bezier(0.16, 1, 0.3, 1) !important;
  --zcs-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1) !important;
  /* The host's own entrance tokens, nudged onto the card's ladder. */
  --default-transition-duration: 120ms;
  --zcode-enter-duration: 260ms;
  --zcode-reveal-duration: 260ms;
  --zcode-reveal-ease: var(--zcs-ease-out);
}

/* ---- sweep: recolour the host's shimmer instead of adding one ---- */
/*
 * The host already runs a background-clip: text gradient with gradient-flow
 * (4s linear, infinite) on .animated-gradient-text. It is the live loading row
 * ("working 42s") and every tool label that is still running. Recolouring its
 * two knobs is enough to read as the card's own sweep, and it cannot desync
 * from the host's state the way a hand-built overlay would: this adds no
 * motion, it only changes ink.
 */
.animated-gradient-text,
.animated-gradient-text-foreground,
.animated-gradient-text-subtle {
  --animated-gradient-text-soft: var(--zcs-shimmer-soft) !important;
}
.animated-gradient-text,
.animated-gradient-text-foreground {
  --animated-gradient-text-strong: var(--zcs-ink) !important;
}
.animated-gradient-text-subtle {
  --animated-gradient-text-strong: var(--zcs-ink-3) !important;
}
@media (prefers-reduced-motion: no-preference) {
  .animated-gradient-text,
  .animated-gradient-text-foreground,
  .animated-gradient-text-subtle {
    /* 4s is a slow tide; 2.8s reads as activity without becoming a strobe. */
    animation-duration: var(--zcs-scan-duration) !important;
  }
}

/* ---- word arrival: a warm breath on each newly revealed unit ---- */
/*
 * [data-zcode-reveal="new"] is the host's own per-word arrival hook: a unit is
 * marked "new" as it streams in and flips to "settled" once shown, so this
 * fires exactly once per unit and needs no observer of ours.
 *
 * text-shadow is deliberate. It cannot change colour, layout or the host's own
 * opacity transition, it is composited off the main thread, and on a non-text
 * unit (code block, image) it is simply inert.
 */
@keyframes zcs-word-warm {
  0% {
    text-shadow: 0 0 0 transparent;
  }
  22% {
    text-shadow: 0 0 9px var(--zcs-shimmer-glow);
  }
  100% {
    text-shadow: 0 0 0 transparent;
  }
}
@media (prefers-reduced-motion: no-preference) {
  [data-zcode-reveal="new"] {
    animation: zcs-word-warm 520ms var(--zcs-ease-out) both;
  }
}

/* ---- control feedback ---- */
/*
 * Scope deliberately narrow: Tailwind's own transition utilities already cover
 * most controls, and a blanket '*'-selector transition would fight them and
 * cost frames on the transcript. These are the interactive things the host
 * leaves instant.
 */
[data-slot="button"],
[data-zcs-nav],
[role="tab"],
[role="menuitem"],
[role="option"] {
  transition-property: color, background-color, border-color, box-shadow, opacity, transform !important;
  transition-duration: var(--zcs-duration-feedback) !important;
  transition-timing-function: var(--zcs-ease-out) !important;
}

/* Press feedback: a 1px settle, the way a physical key gives. */
[data-slot="button"]:active:not(:disabled),
[data-zcs-nav]:active {
  transform: translateY(0.5px);
}

/* ---- floating surfaces ---- */
/*
 * Floating surfaces.
 *
 * ZCode's poppers carry no ARIA role of their own — the only reliable signals
 * are Radix's wrapper element and the data-side attribute on the positioned
 * child. Those elements also carry the host's own animate-in / animate-out
 * classes, which read --tw-duration, so retiming them is a matter of supplying
 * the variable.
 *
 * Deliberately NOT a [class*=animate-in] substring match: collapsibles and
 * accordions put that token inside a descendant selector, and animate their own
 * height over 300ms. Matching them would shorten every expand to 150ms and make
 * it feel clipped.
 */
[data-radix-popper-content-wrapper] > [data-state="open"],
[data-radix-popper-content-wrapper] > [data-state="delayed-open"] {
  --tw-duration: var(--zcs-duration-surface);
  --tw-ease: var(--zcs-ease-out);
}
[data-radix-popper-content-wrapper] > [data-state="closed"] {
  --tw-duration: var(--zcs-duration-exit);
  --tw-ease: var(--zcs-ease-in-out);
}

/*
 * Popovers open with slightly less zoom than the host's default 95%, and from
 * the edge they are anchored to — the same "grows out of its trigger" the dsh
 * menus use.
 */
[data-radix-popper-content-wrapper] > [data-state="open"] {
  --tw-enter-scale: 0.97;
}
[data-radix-popper-content-wrapper] > [data-state="open"][data-side="bottom"] {
  --tw-enter-translate-y: -0.25rem;
}
[data-radix-popper-content-wrapper] > [data-state="open"][data-side="top"] {
  --tw-enter-translate-y: 0.25rem;
}
[data-radix-popper-content-wrapper] > [data-state="open"][data-side="left"] {
  --tw-enter-translate-x: 0.25rem;
}
[data-radix-popper-content-wrapper] > [data-state="open"][data-side="right"] {
  --tw-enter-translate-x: -0.25rem;
}

/* ---- the composer plate ---- */
/* Focusing a field is a 120ms shift, not a snap. */
.chat-composer-input-surface,
.highspeed-composer-surface {
  transition:
    border-color var(--zcs-duration-feedback) var(--zcs-ease-out),
    background-color var(--zcs-duration-feedback) var(--zcs-ease-out),
    box-shadow var(--zcs-duration-feedback) var(--zcs-ease-out) !important;
}
.chat-composer-input-surface:focus-within,
.highspeed-composer-surface:focus-within {
  border-color: var(--color-input-border-focused);
}

/* ---- reasoning effort slider ---- */
/*
 * The host paints the fill with --color-success and the top-stop gradient with
 * --color-blue-500. Those are functional colours and the token layer leaves
 * them alone on purpose (a success toast must stay green), so the slider is
 * repainted here, scoped to this one component.
 */
.composer-thought-slider {
  --composer-thought-max-accent: var(--zcs-accent) !important;
}
.composer-thought-slider-fill,
.composer-thought-slider-fill[data-highspeed="true"],
[data-highspeed="true"] > .composer-thought-meter-fill {
  background: var(--zcs-accent) !important;
}
.composer-thought-slider-fill::before {
  background: linear-gradient(
    270deg in oklch shorter hue,
    var(--zcs-accent) 0%,
    var(--zcs-accent-hover) 100%
  ) !important;
}
.composer-thought-slider-fill[data-highspeed="true"]::before {
  background: linear-gradient(
    90deg in oklab,
    var(--zcs-accent) 0%,
    var(--zcs-accent-hover) 100%
  ) !important;
}
.composer-thought-slider-stop[data-filled="true"] {
  background: var(--zcs-on-accent) !important;
}
/* The thumb stays white by design; the accent ring is what ties it to the card. */
.composer-thought-slider-thumb {
  box-shadow:
    0 0 0 1px var(--zcs-accent),
    0 1px 3px rgba(0, 0, 0, 0.22) !important;
}

/* ---- effort slider: the top stop boils ---- */
/*
 * At max, the host streams bubbles through the fill and fades in a gradient on
 * the fill's ::before. We keep both and add the missing part — motion.
 *
 * Note on "tinting the bubbles": they sit *on* the accent fill, so painting them
 * accent would make them vanish. Tinting here means on-accent (the card's own
 * button ink, so it follows DeepSeek's cool white too) plus a warm halo. The
 * halo is what actually reads against a fill that is already accent.
 */
.composer-thought-bubble > span {
  background: var(--zcs-on-accent) !important;
  box-shadow: 0 0 6px var(--zcs-shimmer-glow) !important;
}
@media (prefers-reduced-motion: no-preference) {
  .composer-thought-slider-fill[data-max="true"]::before {
    /* A 3200ms alternate loop: slow enough to read as liquid, not as a strobe. */
    background-size: 220% 100% !important;
    animation: zcs-fill-tide 3200ms ease-in-out infinite alternate;
  }
}
@keyframes zcs-fill-tide {
  from {
    background-position: 0% 50%;
  }
  to {
    background-position: 100% 50%;
  }
}

/* ---- card swap: one surface sliding over another ---- */
/*
 * The runtime wraps a colour-card change in document.startViewTransition(). The
 * UA default is a symmetric 0.25s crossfade; we bias it — the old skin leaves
 * fast, the new one arrives on the card's own spring — so the swap reads as a
 * layer moving in rather than a blink. Purely presentational: if the API is
 * missing the runtime skips the transition and the swap is instant.
 */
::view-transition-old(root) {
  animation-duration: var(--zcs-duration-surface) !important;
  animation-timing-function: var(--zcs-ease-in-out) !important;
}
::view-transition-new(root) {
  animation-duration: var(--zcs-duration-enter) !important;
  animation-timing-function: var(--zcs-ease-out) !important;
}

/* ---- sidebar rows ---- */
aside [data-slot="button"],
[data-zcs-nav] {
  transition-duration: var(--zcs-duration-feedback) !important;
  transition-timing-function: var(--zcs-ease-out) !important;
}

/* ---- reduced motion ---- */
/*
 * The host gates its own animations; anything we add has to be gated here too,
 * or a reader with the preference set still gets our motion.
 */
@media (prefers-reduced-motion: reduce) {
  [data-slot="button"],
  [data-zcs-nav],
  [role="tab"],
  [role="menuitem"],
  [role="option"],
  .chat-composer-input-surface,
  .highspeed-composer-surface {
    transition-duration: 1ms !important;
  }
  [data-slot="button"]:active:not(:disabled),
  [data-zcs-nav]:active {
    transform: none;
  }
  [data-radix-popper-content-wrapper] > * {
    --tw-duration: 1ms;
    --tw-enter-translate-x: 0;
    --tw-enter-translate-y: 0;
  }
  /* The runtime skips the View Transition under this preference; this is the
     belt-and-braces path in case a transition is ever started elsewhere. */
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 1ms !important;
  }
  .composer-thought-slider-fill[data-max="true"]::before {
    animation: none !important;
  }
}`;
}

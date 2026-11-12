/**
 * Colour cards, ported from dsh-claude-style's design tokens
 * (docs/STYLE.md, the generated token table).
 *
 * The skin's rule is: every visible surface, ink, border and accent reads a
 * tone; a tone belongs to a card. Two cards ship — `claude` (warm editorial,
 * the default look) and `deepseek` (blue). Each card states its values in both
 * schemes, so nothing derives at runtime.
 *
 * Never pure black, never a cold gray: the Claude card's neutrals all carry a
 * little warmth, the DeepSeek card's a little blue.
 */

/** @typedef {"light"|"dark"} Scheme */
/** @typedef {Record<string, string>} Tone */

/** @type {Record<string, {label: string, accent: string, tones: Record<Scheme, Tone>}>} */
export const CARDS = {
  claude: {
    label: "Claude",
    accent: "#d97757",
    tones: {
      light: {
        canvas: "#ffffff",
        "surface-1": "#ffffff",
        "surface-2": "#ffffff",
        "surface-3": "#ffffff",
        overlay: "#ffffff",
        "border-1": "#e9e9e9",
        "border-2": "#dedede",
        "border-3": "#cfcfcf",
        divider: "rgba(22, 22, 22, 0.05)",
        accent: "#d97757",
        "accent-hover": "#c46343",
        "accent-active": "rgba(246, 136, 98, 0.26)",
        "accent-tint": "#f6ded7",
        "on-accent": "#ffffff",
        "hover-wash": "rgba(6, 6, 6, 0.08)",
        "code-wash": "rgba(6, 6, 6, 0.05)",
        "code-block": "#ffffff",
        "code-block-banner": "#ffffff",
        "hover-plate": "#f4f4f4",
        chip: "#f9f9f9",
        "table-head": "#f4f4f4",
        card: "#ffffff",
        sidebar: "#fafafa",
        bubble: "#f4f2f3",
        ink: "#161616",
        "ink-2": "#70686a",
        "ink-3": "#91888a",
        "ink-4": "#b2acad",
        shimmer: "#161616",
        "inverse-ink": "#ffffff",
        "inverse-fill": "#161616",
        "inline-code-fg": "#161616",
        link: "#184f95",
        "link-underline": "rgba(24, 79, 149, 0.6)",
        "ui-link": "#bf6446",
        "ui-link-hover": "#a35035",
        scrollbar: "rgba(213, 213, 213, 0.9)",
        "scrollbar-hover": "rgba(138, 138, 138, 0.8)",
        "logo-ink": "#161616",
        "shadow-lv2":
          "0 4px 18px rgba(20, 20, 19, 0.10), 0 1px 3px rgba(20, 20, 19, 0.05)",
      },
      dark: {
        canvas: "#191919",
        "surface-1": "#212121",
        "surface-2": "#282828",
        "surface-3": "#323232",
        overlay: "#282828",
        "border-1": "rgba(255, 255, 255, 0.09)",
        "border-2": "rgba(255, 255, 255, 0.18)",
        "border-3": "rgba(255, 255, 255, 0.30)",
        divider: "rgba(255, 255, 255, 0.06)",
        accent: "#d97757",
        "accent-hover": "#eb9170",
        "accent-active": "rgba(217, 119, 87, 0.30)",
        "accent-tint": "#48261b",
        "on-accent": "#fbfbfb",
        "hover-wash": "rgba(255, 255, 255, 0.08)",
        "code-wash": "rgba(255, 255, 255, 0.05)",
        "code-block": "#212121",
        "code-block-banner": "#282828",
        "hover-plate": "#323232",
        chip: "#212121",
        "table-head": "#282828",
        card: "#232323",
        sidebar: "#1f1f1f",
        bubble: "rgba(255, 255, 255, 0.06)",
        ink: "#fdfdfd",
        "ink-2": "#beb6b8",
        "ink-3": "#9c9395",
        "ink-4": "#776f71",
        shimmer: "#fdfdfd",
        "inverse-ink": "#171717",
        "inverse-fill": "#fdfdfd",
        "inline-code-fg": "#fdfdfd",
        link: "#8ab4f8",
        "link-underline": "rgba(138, 180, 248, 0.6)",
        "ui-link": "#eaa088",
        "ui-link-hover": "#ffbea6",
        scrollbar: "rgba(62, 62, 62, 0.9)",
        "scrollbar-hover": "rgba(113, 113, 113, 0.9)",
        "logo-ink": "#fdfdfd",
        "shadow-lv2":
          "0 4px 16px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.14)",
      },
    },
  },
  deepseek: {
    label: "DeepSeek",
    accent: "#4d6bfe",
    tones: {
      light: {
        canvas: "#fbfcff",
        "surface-1": "#fbfcff",
        "surface-2": "#fbfcff",
        "surface-3": "#fcfdff",
        overlay: "#ffffff",
        "border-1": "#e7eaf3",
        "border-2": "#dbe0ec",
        "border-3": "#ccd2e2",
        divider: "rgba(19, 20, 22, 0.05)",
        accent: "#4d6bfe",
        "accent-hover": "#3d56e9",
        "accent-active": "rgba(95, 124, 255, 0.26)",
        "accent-tint": "#dce4f7",
        "on-accent": "#fbfcff",
        "hover-wash": "rgba(4, 4, 6, 0.08)",
        "code-wash": "rgba(4, 4, 6, 0.05)",
        "code-block": "#ffffff",
        "code-block-banner": "#ffffff",
        "hover-plate": "#f0f1f4",
        chip: "#f5f6f9",
        "table-head": "#f0f1f4",
        card: "#fbfcff",
        sidebar: "#f7f9ff",
        bubble: "#ecf0ff",
        ink: "#131416",
        "ink-2": "#656871",
        "ink-3": "#848891",
        "ink-4": "#a8abb2",
        shimmer: "#131416",
        "inverse-ink": "#feffff",
        "inverse-fill": "#131416",
        "inline-code-fg": "#0f1115",
        link: "#3b56d9",
        "link-underline": "rgba(59, 86, 217, 0.6)",
        "ui-link": "#3e57e0",
        "ui-link-hover": "#2e41c0",
        scrollbar: "rgba(209, 210, 213, 0.9)",
        "scrollbar-hover": "rgba(134, 135, 138, 0.8)",
        "logo-ink": "#4d6bfe",
        "shadow-lv2":
          "0 4px 18px rgba(20, 20, 19, 0.10), 0 1px 3px rgba(20, 20, 19, 0.05)",
      },
      dark: {
        canvas: "#13161d",
        "surface-1": "#1b1e26",
        "surface-2": "#22252d",
        "surface-3": "#2b2f37",
        overlay: "#22252d",
        "border-1": "#23262e",
        "border-2": "#2c3038",
        "border-3": "#3a3d46",
        divider: "rgba(251, 255, 255, 0.06)",
        accent: "#4d6bfe",
        "accent-hover": "#6a84ff",
        "accent-active": "rgba(77, 107, 254, 0.30)",
        "accent-tint": "#252f4c",
        "on-accent": "#f2f7ff",
        "hover-wash": "rgba(251, 255, 255, 0.08)",
        "code-wash": "rgba(251, 255, 255, 0.05)",
        "code-block": "#1b1e26",
        "code-block-banner": "#22252d",
        "hover-plate": "#2b2f37",
        chip: "#1b1e26",
        "table-head": "#22252d",
        card: "#1d2028",
        sidebar: "#13161d",
        bubble: "#262b36",
        ink: "#f4f9ff",
        "ink-2": "#aeb5c4",
        "ink-3": "#8a92a3",
        "ink-4": "#676e7d",
        shimmer: "#f4f9ff",
        "inverse-ink": "#11141a",
        "inverse-fill": "#f4f9ff",
        "inline-code-fg": "#eef1f8",
        link: "#8fa4ff",
        "link-underline": "rgba(143, 164, 255, 0.6)",
        "ui-link": "#7594fd",
        "ui-link-hover": "#91b1ff",
        scrollbar: "rgba(55, 59, 64, 0.9)",
        "scrollbar-hover": "rgba(105, 109, 115, 0.9)",
        "logo-ink": "#4d6bfe",
        "shadow-lv2":
          "0 4px 16px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.14)",
      },
    },
  },
};

/**
 * Status inks stay literal across cards: a waiting-for-input amber and an
 * unread blue must not be re-tinted by the brand accent, or the sidebar's
 * state stops reading at a glance.
 */
export const LITERAL = {
  "status-unread": "#2a78d6",
  "status-awaiting": "#fab219",
  "status-running": "#898781",
  "field-ring": "#2a78d6",
  "focus-ring-light": "rgba(20, 20, 19, 0.45)",
  "focus-ring-dark": "rgba(250, 249, 245, 0.60)",
  "meter-peak-light": "#a4621d",
  "meter-peak-dark": "#e2a45f",
  "meter-valley-light": "#3d7550",
  "meter-valley-dark": "#8cbf96",
};

/** Motion durations, from the same table. */
export const DURATION = {
  instant: "80ms",
  feedback: "120ms",
  reveal: "120ms",
  enter: "320ms",
  surface: "150ms",
  exit: "120ms",
  hintExit: "50ms",
  hintDelay: "80ms",
};

/** Radius ladder: 4 / 8 / 16, a 12px popover card with 6px rows, pills for CTAs. */
export const RADII = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  card: "12px",
  lg: "16px",
  pill: "999px",
};

export function tones(card, scheme) {
  const entry = CARDS[card] ?? CARDS.claude;
  return entry.tones[scheme];
}

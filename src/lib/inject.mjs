/**
 * Builds the payload and pushes it into the ZCode renderer.
 *
 * The payload carries every card×scheme stylesheet, the face block and the
 * mascot frames, so the panel can switch at runtime without another injection.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCss, buildFontFaceCss, buildPanelCss, motionCss, serifCss } from "../theme/css.mjs";
import { CARDS } from "../theme/palette.mjs";
import {
  listTargets,
  pickRendererTargets,
  evaluateInTarget,
  probeInTarget,
  CdpConnection,
} from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");

const MASCOT_STATES = [
  "idle",
  "thinking",
  "typing",
  "conducting",
  "notification",
  "error",
  "happy",
  "sleeping",
];

function packageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function asset(rel) {
  return path.join(ROOT, "assets", rel);
}

function readFonts() {
  const out = {};
  const sans = asset("fonts/InterVariable.woff2");
  const serif = asset("fonts/SourceSerif4Variable.woff2");
  const mono = asset("fonts/JetBrainsMonoVariable.ttf");
  if (fs.existsSync(sans)) out.sans = dataUri(sans, "font/woff2");
  if (fs.existsSync(serif)) out.serif = dataUri(serif, "font/woff2");
  if (fs.existsSync(mono)) out.mono = dataUri(mono, "font/ttf");
  return out;
}

function readMascot() {
  const out = {};
  for (const state of MASCOT_STATES) {
    const file = asset(`mascot/${state}.gif`);
    if (fs.existsSync(file)) out[state] = dataUri(file, "image/gif");
  }
  return out;
}

/** All four card×scheme stylesheets, no faces (those ride separately). */
export function buildStylesheets() {
  const css = {};
  for (const card of Object.keys(CARDS)) {
    css[card] = {
      light: buildCss({ card, scheme: "light", useFonts: true }),
      dark: buildCss({ card, scheme: "dark", useFonts: true }),
    };
  }
  return css;
}

/**
 * When this process assembled its build. Fixed per process on purpose: the
 * resident host and the CLI each stamp their own start time, which is what lets
 * them agree on which of them is carrying the newer skin.
 *
 * Without that, a host started from an older plugin build sees a newer
 * stylesheet, decides the window is "stale", and pushes its own — the two then
 * overwrite each other every four seconds, and the reader sees the skin flicker
 * between builds. That is exactly what happened once; hence this stamp.
 */
const BUILD_AT = Date.now();

export function buildAt() {
  return BUILD_AT;
}

export function buildPayload(config) {
  const fonts = config.fonts === false ? null : readFonts();
  return {
    version: 2,
    runtimeId: runtimeId(),
    builtAt: BUILD_AT,
    // Fingerprint of the assembled stylesheets. Distinct from runtimeId on
    // purpose: the runtime source can stay byte-identical while a token or a
    // motion rule changes, and that case must still reach a live window.
    styleId: styleId(),
    css: buildStylesheets(),
    panelCss: buildPanelCss(),
    /*
     * Heading face as its own sheet: the settings page mounts or unmounts
     * #zcs-serif, so switching between the editorial serif and plain sans costs
     * one style element rather than a rebuilt payload.
     */
    serifCss: serifCss(),
    // Its own stylesheet: the panel toggles it by mounting/unmounting #zcs-motion.
    motionCss: motionCss(),
    build: packageVersion(),
    // Four chips per card for the settings page's swatch preview.
    swatches: Object.fromEntries(
      Object.entries(CARDS).map(([key, card]) => [key, card.tones.light])
    ),
    fonts: buildFontFaceCss(fonts || undefined),
    mascot: readMascot(),
    accent: Object.fromEntries(
      Object.entries(CARDS).map(([key, card]) => [key, card.accent])
    ),
    defaults: {
      card: config.card || "claude",
      mascot: config.mascot !== false,
      fonts: config.fonts !== false,
      motion: config.motion !== false,
      // Serif is the default; only an explicit `serif: false` turns it off.
      serif: config.serif !== false,
    },
  };
}

let cachedRuntime = null;

export function runtimeSource() {
  if (cachedRuntime === null) {
    cachedRuntime = fs.readFileSync(path.join(here, "..", "runtime", "client.js"), "utf8");
  }
  return cachedRuntime;
}

/** Fingerprint of the runtime source; the injected copy uses it for idempotence. */
export function runtimeId() {
  return crypto.createHash("sha1").update(runtimeSource()).digest("hex").slice(0, 12);
}

let cachedStyleId = null;

/**
 * Fingerprint of everything that ends up in a style element. This is what the
 * resident host compares: a changed token or motion rule re-injects on its own,
 * where runtimeId alone would have looked unchanged.
 */
export function styleId() {
  if (cachedStyleId === null) {
    const parts = [
      JSON.stringify(buildStylesheets()),
      buildPanelCss(),
      motionCss(),
      serifCss(),
    ];
    cachedStyleId = crypto
      .createHash("sha1")
      .update(parts.join("\u0000"))
      .digest("hex")
      .slice(0, 12);
  }
  return cachedStyleId;
}

/** The full expression evaluated in the renderer. */
export function buildInjectionSource(config) {
  const payload = buildPayload(config);
  return `/* zcode-claude-style */\nwindow.__ZCS_PAYLOAD__ = ${JSON.stringify(payload)};\n${runtimeSource()}`;
}

export async function applyToRunning(config) {
  const targets = pickRendererTargets(await listTargets(config.port));
  if (targets.length === 0) {
    throw new Error("在调试端口上没找到 ZCode 的聊天渲染进程");
  }
  const source = buildInjectionSource(config);
  let applied = 0;
  const errors = [];
  for (const target of targets) {
    try {
      await evaluateInTarget(target, source);
      applied += 1;
    } catch (err) {
      errors.push(`${target.title || target.id}: ${err.message}`);
    }
  }
  return { applied, total: targets.length, errors, bytes: source.length };
}

const RESET_SOURCE = `(() => {
  if (window.__zcs && window.__zcs.reset) { window.__zcs.reset(); return "reset"; }
  document.getElementById("zcs-theme")?.remove();
  document.getElementById("zcs-motion")?.remove();
  document.getElementById("zcs-serif")?.remove();
  document.getElementById("zcs-fonts")?.remove();
  document.getElementById("zcs-mascot")?.remove();
  document.getElementById("zcs-page-host")?.remove();
  document.querySelector("[data-zcs-nav]")?.remove();
  document.documentElement.removeAttribute("data-zcs-skin");
  document.documentElement.removeAttribute("data-zcs-fonts");
  document.documentElement.removeAttribute("data-zcs-style-id");
  document.documentElement.removeAttribute("data-zcs-style-at");
  try { localStorage.removeItem("zcs:state"); localStorage.removeItem("zcs:payload"); } catch {}
  return "reset";
})()`;

const STATUS_SOURCE = `(() => {
  const style = document.getElementById("zcs-theme");
  return JSON.stringify({
    skin: document.documentElement.getAttribute("data-zcs-skin") || null,
    scheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    stylesheetBytes: style ? style.textContent.length : 0,
    // Compared by the resident host against its own build, so an edited
    // stylesheet is pushed without the user re-running apply.
    styleId: document.documentElement.getAttribute("data-zcs-style-id") || null,
    styleAt: Number(document.documentElement.getAttribute("data-zcs-style-at")) || 0,
    serif: Boolean(document.getElementById("zcs-serif")),
    mascot: document.getElementById("zcs-mascot")?.dataset.state || null,
    navRow: Boolean(document.querySelector("[data-zcs-nav]")),
    page: Boolean(document.getElementById("zcs-page-host")),
    state: (() => { try { return JSON.parse(localStorage.getItem("zcs:state") || "null"); } catch { return null; } })(),
  });
})()`;

export async function resetRunning(config) {
  const targets = pickRendererTargets(await listTargets(config.port));
  for (const target of targets) {
    await evaluateInTarget(target, RESET_SOURCE);
  }
  return targets.length;
}

export async function readStatus(config) {
  const targets = pickRendererTargets(await listTargets(config.port));
  if (targets.length === 0) return null;
  // Read-only: the watch loop calls this every few seconds, so it must not
  // enable domains or register scripts the way the injection path does.
  const raw = await probeInTarget(targets[0], STATUS_SOURCE);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Screenshots the live window over CDP — the only way to see the skin applied
 * to the real DOM without a screen capture tool.
 */
export async function captureScreenshot(config, outFile) {
  const targets = pickRendererTargets(await listTargets(config.port));
  if (targets.length === 0) throw new Error("没有可截图的 ZCode 窗口");
  const conn = await CdpConnection.connect(targets[0].webSocketDebuggerUrl);
  try {
    await conn.send("Page.enable");
    const { data } = await conn.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const buffer = Buffer.from(data, "base64");
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(path.resolve(outFile), buffer);
    return { bytes: buffer.length, file: path.resolve(outFile), title: targets[0].title };
  } finally {
    conn.close();
  }
}

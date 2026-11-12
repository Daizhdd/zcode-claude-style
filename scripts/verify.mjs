#!/usr/bin/env node
/**
 * Static acceptance for the skin — everything that can be proven without
 * restarting ZCode.
 *
 *   1. Every `--color-*` variable the skin writes must be a variable ZCode
 *      itself declares (read out of resources/app.asar), otherwise we are
 *      painting into a void or, worse, typoing a token.
 *   2. Every class / data attribute the structural layer targets must exist in
 *      the app's own stylesheet or renderer bundle.
 *   3. The generated CSS must parse (balanced blocks, terminated declarations).
 *   4. Body and secondary text must clear WCAG AA (4.5:1) on the canvas and on
 *      the reader's bubble, in both cards and both schemes.
 *   5. The injected payload must stay under a size the renderer can take.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCss, buildPanelCss, motionCss, serifCss } from "../src/theme/css.mjs";
import { CARDS } from "../src/theme/palette.mjs";
import { buildPayload, runtimeSource } from "../src/lib/inject.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASAR =
  process.env.ZCODE_APP_ASAR || "D:\\zcode\\resources\\app.asar";

let failures = 0;
let warnings = 0;

function fail(msg) {
  failures += 1;
  console.log(`  ✗ ${msg}`);
}
function warn(msg) {
  warnings += 1;
  console.log(`  ! ${msg}`);
}
function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

// ------------------------------------------------------------ asar reading

function readAsarIndex(asarPath) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(asarPath, "r");
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const json = Buffer.alloc(jsonLen);
  fs.readSync(fd, json, 0, jsonLen, 16);
  fs.closeSync(fd);
  let index;
  try {
    index = JSON.parse(json.toString("utf8"));
  } catch (err) {
    throw new Error(`app.asar 头部解析失败：${err.message}`);
  }
  return { index, dataStart: 16 + jsonLen };
}

function readAsarFile(asarPath, index, dataStart, filePath) {
  let node = index;
  for (const part of filePath.split("/").filter(Boolean)) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  if (!node.offset) return null;
  const fd = fs.openSync(asarPath, "r");
  const out = Buffer.alloc(Number(node.size));
  fs.readSync(fd, out, 0, out.length, dataStart + Number(node.offset));
  fs.closeSync(fd);
  return out.toString("utf8");
}

function loadAppSources() {
  if (!fs.existsSync(ASAR)) {
    return { error: `找不到 ${ASAR}（可用 ZCODE_APP_ASAR 指定）` };
  }
  const { index, dataStart } = readAsarIndex(ASAR);
  let cssPath = null;
  let bundlePath = null;
  const walk = (node, prefix = "") => {
    for (const [name, child] of Object.entries(node.files || {})) {
      const full = `${prefix}/${name}`;
      if (child.files) walk(child, full);
      else if (/\/out\/renderer\/assets\/styles-.*\.css$/.test(full)) cssPath = full;
      else if (/\/out\/renderer\/assets\/styles-.*\.js$/.test(full)) bundlePath = full;
    }
  };
  walk(index, "");
  if (!cssPath) return { error: "app.asar 里没找到 out/renderer/assets/styles-*.css" };
  const css = readAsarFile(ASAR, index, dataStart, cssPath);
  const bundle = bundlePath ? readAsarFile(ASAR, index, dataStart, bundlePath) : "";
  return { css, bundle, cssPath, bundlePath };
}

// ------------------------------------------------------------------- colour

function parseColor(value) {
  const v = value.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  return null;
}

function over(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgValue, bgValue, baseValue) {
  const base = parseColor(baseValue || bgValue);
  const bgRaw = parseColor(bgValue);
  const fgRaw = parseColor(fgValue);
  if (!base || !bgRaw || !fgRaw) return null;
  // A translucent surface (a dark bubble is white at 6%) is only meaningful
  // once it sits on the canvas.
  const bg = bgRaw.a < 1 ? over(bgRaw, base) : bgRaw;
  const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --------------------------------------------------------------------- main

console.log("zcode-claude-style · static verification\n");

const app = loadAppSources();
if (app.error) {
  fail(app.error);
} else {
  pass(`读取 app.asar：${app.cssPath}（${(app.css.length / 1024).toFixed(0)} KB）`);
}

const declared = new Set();
if (app.css) {
  for (const m of app.css.matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1]);
}

const generated = [];
for (const card of Object.keys(CARDS)) {
  for (const scheme of ["light", "dark"]) {
    generated.push({
      card,
      scheme,
      css: buildCss({ card, scheme, useFonts: true, mascot: true }),
    });
  }
}

console.log("\n[1] 令牌覆盖");
{
  const written = new Set();
  for (const { css } of generated) {
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) written.add(m[1]);
  }
  const appTokens = [...written].filter(
    (t) => t.startsWith("--color-") || t.startsWith("--tw-prose-")
  );
  const unknown = appTokens.filter((t) => app.css && !declared.has(t));
  if (!app.css) warn("没有应用样式表，跳过存在性校验");
  else if (unknown.length === 0) pass(`${appTokens.length} 个宿主变量（--color-* / --tw-prose-*）全部存在于 ZCode 自身样式表`);
  else fail(`ZCode 未声明这些变量：${unknown.join(", ")}`);

  const privateOnes = [...written].filter((t) => t.startsWith("--zcs-"));
  pass(`皮肤私有变量 ${privateOnes.length} 个（--zcs-*，不会与宿主冲突）`);

  const shadowed = appTokens.filter((t) =>
    /^--color-(destructive|success|warning)/.test(t)
  );
  if (shadowed.length === 0) pass("未触碰功能性配色（错误红/成功绿/警告黄）");
  else warn(`改到了功能性配色：${shadowed.join(", ")}`);
}

console.log("\n[2] 选择器存在性");
{
  const structural = new Set();
  for (const { css } of generated) {
    for (const m of css.matchAll(/^[^{}@]+\{/gm)) {
      const sel = m[0].replace(/\{$/, "").trim();
      for (const part of sel.split(",")) structural.add(part.trim());
    }
  }
  const known = [
    { token: ".chat-composer-input-surface", where: "css", probe: "chat-composer-input-surface" },
    { token: ".highspeed-composer-surface", where: "css", probe: "highspeed-composer-surface" },
    { token: ".prose", where: "css", probe: ".prose" },
    { token: "[data-composer-layout]", where: "bundle", probe: "data-composer-layout" },
    { token: '[data-testid="v4-running-subagent-stop"]', where: "bundle", probe: "v4-running-subagent-stop" },
    { token: "[data-composer-thought-stop]", where: "bundle", probe: "data-composer-thought-stop" },
    { token: '[data-testid="workflow-stream-chevrons"]', where: "bundle", probe: "workflow-stream-chevrons" },
  ];
  const hayCss = app.css || "";
  const hayBundle = app.bundle || "";
  let missing = 0;
  for (const { token, where, probe } of known) {
    const hay = where === "css" ? hayCss : hayBundle;
    if (!hay.includes(probe)) {
      missing += 1;
      warn(`宿主里没找到 ${token}（${where}）—— 运行时会静默降级`);
    }
  }
  if (missing === 0) pass(`${known.length} 个锚点选择器全部出现在宿主代码里`);
  pass(`结构层共 ${structural.size} 个选择器`);
}

console.log("\n[3] CSS 语法");
{
  for (const { card, scheme, css } of generated) {
    let depth = 0;
    for (const ch of css) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      if (depth < 0) break;
    }
    if (depth !== 0) fail(`${card}/${scheme} 花括号不配对（depth=${depth}）`);
    const badDecl = css
      .split("\n")
      .filter((line) => /^\s*--[a-z0-9-]+\s*:/.test(line) && !line.trim().endsWith(";"));
    if (badDecl.length) fail(`${card}/${scheme} 有未以分号结尾的声明：${badDecl[0].trim()}`);
  }
  if (failures === 0) pass("四套样式表括号配对、声明完整");
}

console.log("\n[4] 对比度（正文 WCAG AA 4.5:1 · 强调按钮 3:1）");
{
  for (const card of Object.keys(CARDS)) {
    for (const scheme of ["light", "dark"]) {
      const t = CARDS[card].tones[scheme];
      const rows = [
        { label: "正文/canvas", fg: t.ink, bg: t.canvas, min: 4.5 },
        { label: "次级/canvas", fg: t["ink-2"], bg: t.canvas, min: 4.5 },
        { label: "正文/气泡", fg: t.ink, bg: t.bubble, min: 4.5, base: t.canvas },
        { label: "正文/卡片", fg: t.ink, bg: t.card, min: 4.5 },
        { label: "链接/canvas", fg: t.link, bg: t.canvas, min: 4.5 },
        { label: "按钮字/accent", fg: t["on-accent"], bg: t.accent, min: 3.0 },
        { label: "最淡ink/canvas", fg: t["ink-4"], bg: t.canvas, min: 0 },
      ].map((row) => ({ ...row, ratio: contrast(row.fg, row.bg, row.base) }));

      const failing = rows.filter((r) => r.min > 0 && (r.ratio === null || r.ratio < r.min));
      const line = rows
        .map((r) => `${r.label} ${r.ratio ? r.ratio.toFixed(2) : "?"}`)
        .join(" · ");
      if (failing.length) {
        fail(
          `${card}/${scheme} 不达标：${failing
            .map((r) => `${r.label} ${r.ratio ? r.ratio.toFixed(2) : "?"}<${r.min}`)
            .join("，")}｜${line}`
        );
      } else {
        const weakest = rows
          .filter((r) => r.min > 0)
          .reduce((a, b) => (a.ratio < b.ratio ? a : b));
        pass(`${card}/${scheme} 全部达标，最弱 ${weakest.ratio.toFixed(2)}（${weakest.label}）`);
      }
    }
  }
}

console.log("\n[4b] 动效层");
{
  const css = motionCss();
  const checks = [
    ["时序令牌 --zcs-ease-out", css.includes("--zcs-ease-out")],
    ["控件反馈 120ms", css.includes("--zcs-duration-feedback")],
    [
      "浮层只认 radix 包装",
      css.includes('[data-radix-popper-content-wrapper] > [data-state="open"]'),
    ],
    [
      "不用 class*=animate-in 子串（会误伤折叠面板）",
      !css.includes('[class*="animate-in"]'),
    ],
    ["reduced-motion 有门禁", css.includes("prefers-reduced-motion")],
    ["不接管消息内容动画（交还宿主）", !css.includes("zcode-stream-text-in")],
  ];
  for (const [label, okFlag] of checks) {
    if (okFlag) pass(label);
    else fail(label);
  }
  const themeSheet = buildCss({ card: "claude", scheme: "light", useFonts: true });
  if (!themeSheet.includes("--zcs-ease-out")) {
    pass("动效独立于配色表，开关即挂载/卸载");
  } else {
    fail("动效被烘进了配色表，开关无法单独生效");
  }
}

console.log("\n[4c] 动效第二档（扫光 / 新字微光 / 推理滑块）");
{
  const css = motionCss();

  /*
   * The motion sheet is a separate file that reads --zcs-* variables out of the
   * theme sheet. A renamed or forgotten variable does not error: the whole
   * declaration just computes to nothing and the effect silently disappears.
   * This is the check that catches it.
   */
  const read = new Set([...css.matchAll(/var\((--zcs-[a-z0-9-]+)/g)].map((m) => m[1]));
  // The sheet defines a few knobs of its own (easings, scan duration); only the
  // ones it merely reads have to come from somewhere else.
  const selfDefined = new Set([...css.matchAll(/(--zcs-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const name of selfDefined) read.delete(name);
  for (const card of Object.keys(CARDS)) {
    for (const scheme of ["light", "dark"]) {
      const sheet = buildCss({ card, scheme, useFonts: true });
      const defined = new Set(
        [...sheet.matchAll(/(--zcs-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
      );
      const missing = [...read].filter((v) => !defined.has(v));
      if (missing.length) fail(`${card}/${scheme} 动效引用了未定义变量：${missing.join(", ")}`);
    }
  }
  if (read.size) pass(`动效引用的 ${read.size} 个 --zcs-* 变量在四张配色表里都有定义`);

  const noPrefAt = css.indexOf("prefers-reduced-motion: no-preference");
  const wordWarmGated =
    noPrefAt !== -1 && css.slice(noPrefAt).includes("zcs-word-warm");

  const checks = [
    [
      "扫光是重着色宿主的 --animated-gradient-text-soft（不另造动画）",
      css.includes("--animated-gradient-text-soft: var(--zcs-shimmer-soft)"),
    ],
    ["扫光速度被重新定拍（--zcs-scan-duration）", css.includes("--zcs-scan-duration")],
    [
      "扫光重定拍受 reduced-motion 门禁",
      noPrefAt !== -1 && css.slice(noPrefAt).includes("animation-duration: var(--zcs-scan-duration)"),
    ],
    [
      "新字微光挂在宿主自己的 data-zcode-reveal=new 上",
      css.includes('[data-zcode-reveal="new"]'),
    ],
    ["新字微光只用 text-shadow（不碰字色与布局）", /text-shadow:\s*0 0 \d+px/.test(css)],
    ["新字微光受 reduced-motion 门禁", wordWarmGated],
    ["推理滑块填充改为色卡 accent", /\.composer-thought-slider-fill[\s\S]{0,160}background: var\(--zcs-accent\)/.test(css)],
    ["滑块最高档渐变改为 accent 系列", css.includes("--zcs-accent-hover) 100%")],
    ["滑块 thumb 用 accent 描边定调", css.includes("0 0 0 1px var(--zcs-accent)")],
    // The token layer leaves functional colours alone; the slider is the one
    // place that has to override a functional colour, and it must do so scoped
    // to the component rather than by redefining --color-success.
    ["未全局改写 --color-success（只在本组件内覆写）", !/--color-success\s*:/.test(css)],
    // Tier 3a: the top stop boils.
    [
      "满档气泡用 on-accent（不是 accent，否则在 accent 填充上隐形）",
      /\.composer-thought-bubble > span\s*\{[\s\S]{0,160}background: var\(--zcs-on-accent\)/.test(css),
    ],
    ["满档渐变缓慢流动（zcs-fill-tide）", css.includes("@keyframes zcs-fill-tide")],
    [
      "满档流动受 reduced-motion 门禁",
      noPrefAt !== -1 && css.slice(noPrefAt).includes("zcs-fill-tide"),
    ],
    // Tier 3b: card swap crossfade.
    ["换卡 crossfade 覆盖 view-transition-old(root)", css.includes("::view-transition-old(root)")],
    ["旧皮快速退、新皮从容进（不同时长）", /old\(root\)[\s\S]{0,200}--zcs-duration-surface/.test(css) && /new\(root\)[\s\S]{0,200}--zcs-duration-enter/.test(css)],
  ];
  for (const [label, okFlag] of checks) {
    if (okFlag) pass(label);
    else fail(label);
  }

  // Host-side anchors for the tier-2 rules; a renamed class here means the
  // effect stops applying without any error anywhere.
  const anchors = [
    [".animated-gradient-text", "扫光"],
    ["--composer-thought-max-accent", "滑块最高档"],
    [".composer-thought-slider-fill", "滑块填充"],
    [".composer-thought-slider-thumb", "滑块拖手"],
    [".composer-thought-bubble", "满档气泡"],
    ["data-zcode-reveal", "逐词入场钩子"],
  ];
  const missingAnchors = anchors.filter(([probe]) => app.css && !app.css.includes(probe));
  if (!app.css) warn("没有应用样式表，跳过动效锚点校验");
  else if (missingAnchors.length === 0) pass(`${anchors.length} 个动效锚点在宿主样式表里都存在`);
  else fail(`宿主动效锚点缺失：${missingAnchors.map(([p, n]) => `${n}(${p})`).join("、")}`);
}

console.log("\n[4d] 字体族：思源宋体 + Source Serif 4");
{
  const sans = buildCss({ card: "claude", scheme: "light", useFonts: true });
  const serif = serifCss();
  const checks = [
    // The whole point of this round: a CJK entry in the stack. Without it
    // Windows fell through to SimSun and the serif looked cheap.
    ["字体栈里有中文字体（Noto Serif SC）", serif.includes('"Noto Serif SC"')],
    ["中文字体排在西文之前之外的兜底位置", /--font-sans: .*"ZCS Serif".*"Noto Serif SC"/.test(serif)],
    ["衬线表只覆写 --font-sans（不接管 --font-mono）", !serif.includes("--font-mono")],
    // Face is decided by the variable alone; the sheet's .prose rules are the
    // dark-mode weight compensation and must not set font-family.
    ["字体族只经 --font-sans 下发，不逐个元素挑字体", !/font-family\s*:/.test(serif)],
    ["光学尺寸轴启用（font-optical-sizing）", serif.includes("font-optical-sizing: auto")],
    ["深色下做字重逆补偿", /html\.dark \{[\s\S]*--font-weight-normal: 360/.test(serif)],
    // The variables alone are inert: the host paints prose with literal weights.
    ["补偿落到实际绘制文字的选择器上", /html\.dark \.prose[\s\S]*font-weight: var\(--font-weight-normal\)/.test(serif)],
    ["标题跟着降一档（semibold）", /html\.dark \.prose :is\(h1[\s\S]*--font-weight-semibold/.test(serif)],
    ["补偿幅度与 Claude 一致（−40 / −40 / −50）", /normal: 360[\s\S]*medium: 460[\s\S]*semibold: 550/.test(serif)],
    ["配色表仍声明无衬线默认（关掉开关用）", sans.includes("--font-sans:") && sans.includes("ZCS Inter")],
    ["字重与字距留在配色表（切字体不跳字距）", /letter-spacing: -0\.011em/.test(sans)],
    ["面板页标题跟随 --font-sans", buildPanelCss().includes("font-family: var(--font-sans")],
  ];
  for (const [label, okFlag] of checks) {
    if (okFlag) pass(label);
    else fail(label);
  }

  // The serif face file must actually be the variable one, or the dark-mode
  // weight compensation silently becomes a no-op.
  const serifFile = path.join(ROOT, "assets", "fonts", "SourceSerif4Variable.woff2");
  if (fs.existsSync(serifFile)) {
    const kb = (fs.statSync(serifFile).size / 1024).toFixed(0);
    pass(`西文字体 Source Serif 4 可变版在位（${kb} KB，含 wght + opsz 轴）`);
  } else {
    fail("assets/fonts/SourceSerif4Variable.woff2 缺失");
  }
}

console.log("\n[5] payload 体积");
{
  const payload = buildPayload({ card: "claude", mascot: true, fonts: true });
  const runtime = runtimeSource();
  const source = `window.__ZCS_PAYLOAD__ = ${JSON.stringify(payload)};\n${runtime}`;
  const mb = source.length / 1024 / 1024;
  if (mb > 8) fail(`注入源码 ${mb.toFixed(2)} MB，CDP evaluate 会明显卡顿`);
  else pass(`注入源码 ${mb.toFixed(2)} MB（样式表 ${JSON.stringify(payload.css).length / 1024 | 0} KB，字体 ${(payload.fonts.length / 1024 | 0)} KB，鲸鱼 ${Object.keys(payload.mascot).length} 帧）`);

  const frames = Object.keys(payload.mascot);
  const expect = ["idle", "thinking", "typing", "conducting", "notification", "error", "happy", "sleeping"];
  const missing = expect.filter((f) => !frames.includes(f));
  if (missing.length) fail(`缺少鲸鱼状态：${missing.join(", ")}`);
  else pass("八态鲸鱼帧齐全");

  const cssText = JSON.stringify(payload.css).length;
  if (cssText > 1024 * 1024) warn("样式表超过 1 MB，检查是否误把字体塞进了 CSS");
}

console.log("\n[6] 运行时自检");
{
  const rt = runtimeSource();
  const checks = [
    ["幂等标记 window.__zcs", rt.includes("window.__zcs")],
    ["随 reload 恢复（localStorage payload）", rt.includes("PAYLOAD_KEY")],
    ["跟随应用明暗（MutationObserver on html.class）", /attributeFilter:\s*\["class"\]/.test(rt)],
    ["复位入口 reset()", rt.includes("reset()")],
    ["所有探针有 try/catch", (rt.match(/catch\s*[{(]/g) || []).length >= 5],
    // Regression: the whale used to fall back to a fixed spot when no composer
    // existed, so it hovered in the middle of the plugins list.
    ["鲸鱼无锚点时隐藏而不是回退定位", rt.includes('host.dataset.visible = "0"')],
    ["鲸鱼在自带设置页隐藏", rt.includes('pageOpen') && rt.includes("page-host")],
    ["不写入宿主 DOM 之外的东西", !/document\.body\.innerHTML\s*=/.test(rt)],
    // Residency: the host must be able to tell "skin up" from "skin up and current".
    ["皮肤自报样式指纹（data-zcs-style-id）", rt.includes("zcsStyleId")],
    // Regression: teardown() used to leave #zcs-motion mounted, so reset left our
    // transitions running on the bare host.
    [
      "teardown 卸载动效样式表",
      /teardown\(\)\s*\{[\s\S]{0,400}motion`\)\?\.remove\(\)/.test(rt),
    ],
    // Tier 3b: the card swap must degrade, not break, on any host without the API.
    ["换卡走 View Transition（有降级分支）", rt.includes("startViewTransition") && rt.includes("function switchCard")],
    ["流式输出中跳过快照（避免鬼影）", rt.includes("data-v4-running-live-tail")],
    ["reduced-motion / 动效关闭时直接切", /!state\.motion[\s\S]{0,120}prefers-reduced-motion|prefers-reduced-motion[\s\S]{0,200}!state\.motion/.test(rt)],
    // Whole-interface serif: mounted on demand, on by default, and a new state
    // key so an old `serif:false` in localStorage cannot veto the new default.
    ["衬线表按需挂载/卸载（#zcs-serif）", /PREFIX\}-serif/.test(rt)],
    ["面板有「衬线字体」开关", rt.includes('data-role="serifAll"')],
    ["状态键改名 serifAll（旧值不复活）", rt.includes("saved.serifAll")],
    ["缺省值判 !== false（默认开）", rt.includes("defaults.serif !== false")],
    ["teardown 一并撤掉衬线表", /serif`\)\?\.remove\(\)/.test(rt)],
  ];
  for (const [label, okFlag] of checks) {
    if (okFlag) pass(label);
    else fail(label);
  }

  const payload = buildPayload({ card: "claude", mascot: true, fonts: true });
  if (payload.styleId && payload.styleId.length === 12) pass(`样式指纹 ${payload.styleId} 随 payload 下发`);
  else fail("payload 缺少 styleId，巡检无法判断样式是否过期");

  const host = fs.readFileSync(path.join(ROOT, "src", "mcp", "server.mjs"), "utf8");
  if (/status\.styleId\s*!==\s*current/.test(host)) pass("巡检比对样式指纹，过期即补注入");
  else fail("巡检只看「有没有样式表」，插件的样式改动不会自动生效");

  // Cost control: the watch loop used to reuse the injection path, so every
  // 4-second probe also enabled Runtime + Page and registered a script. Measured
  // 22.9ms per probe against 12ms for a bare evaluate.
  const cdp = fs.readFileSync(path.join(ROOT, "src", "lib", "cdp.mjs"), "utf8");
  const injectSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "inject.mjs"), "utf8");
  // Take the function body only — slicing up to the next `export` would pull in
  // that function's doc comment and match the very strings we are hunting for.
  const probeMatch = /export async function probeInTarget[\s\S]*?\n}\n/.exec(cdp);
  const probeBody = probeMatch ? probeMatch[0] : "";
  if (probeBody && !/Runtime\.enable|Page\.enable|addScriptToEvaluateOnNewDocument/.test(probeBody)) {
    pass("只读探针不启用任何 CDP domain、不注册脚本");
  } else {
    fail("只读探针仍在 enable domain / 注册脚本，巡检成本翻倍");
  }
  if (/probeInTarget\(targets\[0\], STATUS_SOURCE\)/.test(injectSrc)) {
    pass("readStatus 走只读探针而不是注入路径");
  } else {
    fail("readStatus 仍在复用 evaluateInTarget");
  }
  const healthy = /ZCS_WATCH_INTERVAL \|\| (\d+)/.exec(host);
  const recover = /ZCS_WATCH_RECOVER \|\| (\d+)/.exec(host);
  const idle = /ZCS_WATCH_IDLE \|\| (\d+)/.exec(host);
  if (healthy && Number(healthy[1]) >= 20000) pass(`健康巡检间隔 ${healthy[1]}ms（不再是 4 秒）`);
  else fail("健康巡检间隔仍过短");
  if (recover && Number(recover[1]) <= 3000) pass(`皮肤缺失时 ${recover[1]}ms 快恢复`);
  else fail("缺少快恢复间隔，窗口重载后要等很久");
  if (idle && Number(idle[1]) >= 5000) pass(`无调试端口时退避到 ${idle[1]}ms`);
  else fail("无端口时仍在高频重试");
  if (/const tick = async \(\) =>/.test(host) && /setTimeout\(tick/.test(host)) {
    pass("巡检自调度（每轮自己决定下一次延迟）");
  } else {
    fail("仍是固定 setInterval，无法双速");
  }

  // Regression: without a build stamp the host and the CLI overwrite each other
  // every four seconds, and the skin visibly flickers between two builds.
  const hasStamp = payload.builtAt > 0;
  if (hasStamp) pass("payload 带构建时间戳（builtAt）");
  else fail("payload 没有 builtAt，巡检与 CLI 会互相覆盖");
  if (rt.includes("zcsStyleAt")) pass("皮肤自报安装时间（data-zcs-style-at）");
  else fail("窗口没有记录安装时间，巡检无法判断谁更新");
  if (/windowAt\s*<\s*mineAt/.test(host)) pass("巡检只覆盖比自己更旧的窗口（不打架）");
  else fail("巡检没有时间比对，会和更新的注入器来回覆盖");
  if (/newer:\$\{status\.styleId\}/.test(host)) pass("发现更新的皮肤时主动让位并记录");
  else fail("巡检缺少「让位」分支");
}

console.log(
  `\n${failures === 0 ? "通过" : "未通过"}：${failures} 个失败 · ${warnings} 个提醒`
);
process.exit(failures === 0 ? 0 : 1);

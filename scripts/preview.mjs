#!/usr/bin/env node
/**
 * Builds a static preview page from ZCode's *real* compiled stylesheet plus the
 * skin's overrides, so colours, type and shape can be reviewed without
 * restarting the app.
 *
 *   node scripts/preview.mjs [outDir]
 *
 * Then screenshot each page with a headless Chromium:
 *   msedge --headless=new --screenshot=out.png --window-size=1440,900 file:///...html
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCss } from "../src/theme/css.mjs";
import { CARDS } from "../src/theme/palette.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASAR = process.env.ZCODE_APP_ASAR || "D:\\zcode\\resources\\app.asar";
const OUT = path.resolve(process.argv[2] || path.join(ROOT, ".preview"));

function readAsarIndex(asarPath) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(asarPath, "r");
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const json = Buffer.alloc(jsonLen);
  fs.readSync(fd, json, 0, jsonLen, 16);
  fs.closeSync(fd);
  return { index: JSON.parse(json.toString("utf8")), dataStart: 16 + jsonLen };
}

function readAsarFile(asarPath, index, dataStart, filePath) {
  let node = index;
  for (const part of filePath.split("/").filter(Boolean)) {
    if (!node.files?.[part]) return null;
    node = node.files[part];
  }
  if (node.offset === undefined) return null;
  const fd = fs.openSync(asarPath, "r");
  const out = Buffer.alloc(Number(node.size));
  fs.readSync(fd, out, 0, out.length, dataStart + Number(node.offset));
  fs.closeSync(fd);
  return out.toString("utf8");
}

function appStylesheet() {
  const cached = path.join(OUT, "zcode-app.css");
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");
  if (!fs.existsSync(ASAR)) throw new Error(`找不到 ${ASAR}`);
  const { index, dataStart } = readAsarIndex(ASAR);
  let found = null;
  const walk = (node, prefix = "") => {
    for (const [name, child] of Object.entries(node.files || {})) {
      const full = `${prefix}/${name}`;
      if (child.files) walk(child, full);
      else if (/\/out\/renderer\/assets\/styles-.*\.css$/.test(full)) found = full;
    }
  };
  walk(index);
  if (!found) throw new Error("app.asar 里没找到渲染层样式表");
  const css = readAsarFile(ASAR, index, dataStart, found);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(cached, css, "utf8");
  return css;
}

const BODY = `
<div class="flex h-full w-full text-sm" style="height:100vh">
  <aside class="bg-sidebar border-border flex flex-col" style="width:264px;border-right-width:1px">
    <div class="flex items-center gap-2 px-3 py-3">
      <div style="width:22px;height:22px;border-radius:6px;background:var(--color-brand)"></div>
      <span class="text-foreground font-medium">ZCode</span>
    </div>
    <div class="px-3 py-2 text-foreground-subtle text-xs">今天</div>
    <div class="px-3 py-2 rounded-md" style="background:var(--color-hover);color:var(--color-foreground)">Claude 风格落地</div>
    <div class="px-3 py-2 text-foreground-subtle">dsh 插件调研</div>
    <div class="px-3 py-2 text-foreground-subtle">Tailwind token 映射</div>
    <div class="mt-auto px-3 py-3 text-foreground-subtlest text-xs border-border" style="border-top-width:1px">12 个会话 · 本地</div>
  </aside>

  <main class="bg-background flex flex-col flex-1" style="min-width:0">
    <header class="bg-panel border-border flex items-center justify-between px-4 py-3" style="border-bottom-width:1px">
      <div class="text-foreground font-medium">Claude 风格落地</div>
      <div class="flex gap-2">
        <button class="px-3 py-1 rounded-md border border-border text-foreground-subtle">分享</button>
        <button class="px-3 py-1 rounded-md" style="background:var(--color-brand);color:var(--color-primary-foreground)">新会话</button>
      </div>
    </header>

    <div class="flex-1 px-6 py-6 flex flex-col gap-5" style="overflow:auto;max-width:820px;margin:0 auto;width:100%">
      <div class="flex justify-end">
        <div class="px-3 py-2 rounded-lg" style="max-width:70%;background:var(--color-user-message-bubble);color:var(--color-foreground)">
          把 dsh 那套 Claude 风格搬到 ZCode 上
        </div>
      </div>

      <div class="prose text-foreground">
        <h2>实现方式</h2>
        <p>ZCode 的界面是 Tailwind v4 语义 token，所以换肤的关键不是复制 CSS，而是把上游的设计梯度翻译成
          <code>--color-*</code> 变量。正文用 <a href="#">这个链接</a> 演示强调色。</p>
        <ul>
          <li>色卡：Claude 暖色 / DeepSeek 蓝</li>
          <li>字体：Inter 正文，Noto Serif 标题，JetBrains Mono 代码</li>
          <li>圆角梯度：4 / 6 / 8 / 12 / 16</li>
        </ul>
        <pre><code>const theme = buildCss({ card: "claude", scheme: "dark" });</code></pre>
        <blockquote>初版先对齐颜色与形状，鲸鱼状态机随后校准。</blockquote>
      </div>

      <div class="flex gap-2">
        <span class="px-2 py-1 rounded-md text-xs" style="background:var(--color-tag);color:var(--color-foreground-subtle)">令牌</span>
        <span class="px-2 py-1 rounded-md text-xs" style="background:var(--color-accent);color:var(--color-foreground)">强调底色</span>
        <span class="px-2 py-1 rounded-md text-xs" style="background:var(--color-success-surface);color:var(--color-success-surface-foreground)">完成</span>
        <span class="px-2 py-1 rounded-md text-xs" style="background:var(--color-destructive-surface);color:var(--color-destructive-surface-foreground)">失败</span>
        <span class="px-2 py-1 rounded-md text-xs" style="background:var(--color-warning-surface);color:var(--color-warning-surface-foreground)">等待</span>
      </div>

      <div class="rounded-lg border border-border bg-card px-3 py-2 text-foreground-subtle">
        卡片 surface：<span class="text-foreground">正文 ink</span> · <span class="text-foreground-subtle">次级 ink-2</span> ·
        <span class="text-foreground-subtlest">最淡 ink-3</span>
      </div>

      <div class="rounded-xl px-3 py-2 flex items-center justify-between" style="background:var(--color-input);border:1px solid var(--color-input-border)">
        <span class="text-foreground-subtlest">给 ZCode 发消息…</span>
        <span class="px-2 py-1 rounded-full text-xs" style="background:var(--color-brand);color:var(--color-primary-foreground)">发送</span>
      </div>
    </div>
  </main>
</div>`;

function page({ title, appCss, themeCss, scheme }) {
  return `<!doctype html>
<html lang="zh-CN" class="${scheme === "dark" ? "dark" : ""}">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>${appCss}</style>
<style>${themeCss}</style>
<style>
  html, body { height: 100%; margin: 0; }
  body { font-family: var(--font-sans); background: var(--color-background); }
  .prose code:not(pre code) { font-family: var(--font-mono); }
  pre code { font-family: var(--font-mono); }
</style>
</head>
<body>${BODY}</body>
</html>`;
}

const appCss = appStylesheet();
fs.mkdirSync(OUT, { recursive: true });

for (const card of Object.keys(CARDS)) {
  for (const scheme of ["light", "dark"]) {
    const themeCss = buildCss({ card, scheme, useFonts: false, mascot: true });
    const file = path.join(OUT, `preview-${card}-${scheme}.html`);
    fs.writeFileSync(
      file,
      page({ title: `${card} · ${scheme}`, appCss, themeCss, scheme }),
      "utf8"
    );
    console.log(file);
  }
}

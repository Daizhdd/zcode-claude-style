#!/usr/bin/env node
/**
 * zcode-claude-style CLI.
 *
 *   zcode-claude-style apply   注入到正在运行的 ZCode（需要调试端口）
 *   zcode-claude-style launch  以调试端口启动 ZCode 并注入
 *   zcode-claude-style status  查看当前皮肤状态
 *   zcode-claude-style reset   移除皮肤
 *   zcode-claude-style css     导出主题 CSS（预览 / 校验用）
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCss, buildFontFaceCss, serifCss } from "./theme/css.mjs";
import { CARDS } from "./theme/palette.mjs";
import { loadConfig, saveConfig, configFile, dataDir } from "./lib/config.mjs";
import { launchWithDebugPort, isZcodeRunning, findZcodeExecutable } from "./lib/launcher.mjs";
import { applyToRunning, resetRunning, readStatus, captureScreenshot } from "./lib/inject.mjs";

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");

const args = process.argv.slice(2);
const command = args[0] || "help";

function flag(name) {
  return args.includes(`--${name}`);
}

function option(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function patchFromArgs(patch = {}) {
  const card = option("card");
  if (card) {
    if (!CARDS[card]) fail(`未知色卡 "${card}"，可选：${Object.keys(CARDS).join(" / ")}`);
    patch.card = card;
  }
  const port = option("port");
  if (port) patch.port = Number(port);
  if (flag("no-mascot")) patch.mascot = false;
  if (flag("mascot")) patch.mascot = true;
  if (flag("no-fonts")) patch.fonts = false;
  if (flag("fonts")) patch.fonts = true;
  if (flag("no-motion")) patch.motion = false;
  if (flag("motion")) patch.motion = true;
  if (flag("no-serif")) patch.serif = false;
  if (flag("serif")) patch.serif = true;
  return patch;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function describe(config) {
  return [
    `色卡   ${CARDS[config.card]?.label || config.card} (${config.card})`,
    `明暗   跟随 ZCode 自身主题`,
    `鲸鱼   ${config.mascot ? "开启" : "关闭"}`,
    `字体   ${config.fonts ? "开启（内置 Inter / Noto Serif / JetBrains Mono）" : "关闭"}`,
    `字体族 ${config.serif !== false ? "衬线（Noto Serif 覆盖整个界面）" : "无衬线（Inter）"}`,
    `动效   ${config.motion !== false ? "开启（控件反馈 / 浮层进出）" : "关闭"}`,
    `端口   ${config.port}`,
  ].join("\n");
}

async function cmdApply() {
  const config = saveConfig(patchFromArgs());
  console.log(describe(config));
  const result = await applyToRunning(config);
  ok(`已注入 ${result.applied}/${result.total} 个渲染进程（payload ${(result.bytes / 1024).toFixed(0)} KB）`);
  if (result.errors.length) {
    console.warn("部分窗口注入失败：");
    for (const line of result.errors) console.warn(`  - ${line}`);
  }
}

async function cmdLaunch() {
  const config = saveConfig(patchFromArgs());
  const result = await launchWithDebugPort(config.port);
  if (!result.launched && /正在运行/.test(result.reason || "")) {
    fail(`${result.reason}\n  提示：先在任务栏托盘右键完全退出 ZCode，再重跑本命令。`);
  }
  if (!result.launched && !/已经在监听/.test(result.reason || "")) {
    fail(result.reason || "启动失败");
  }
  if (result.executable) ok(`已启动 ${result.executable}（调试端口 ${config.port}）`);
  else ok(result.reason);
  // Give the renderer a moment to finish booting before pushing the skin.
  await new Promise((r) => setTimeout(r, 1500));
  const injected = await applyToRunning(config);
  ok(`已注入 ${injected.applied}/${injected.total} 个渲染进程`);
}

async function cmdStatus() {
  const config = loadConfig();
  console.log(`配置文件  ${configFile()}`);
  console.log(`ZCode     ${findZcodeExecutable() || "未找到"}`);
  console.log(`进程      ${(await isZcodeRunning()) ? "运行中" : "未运行"}`);
  console.log(describe(config));
  try {
    const status = await readStatus(config);
    if (!status) {
      console.log("调试端口  无可用目标（未以 --remote-debugging-port 启动）");
      return;
    }
    console.log("运行状态  " + JSON.stringify(status, null, 2));
  } catch (err) {
    console.log(`调试端口  ${err.message}`);
  }
}

async function cmdReset() {
  const config = loadConfig();
  const count = await resetRunning(config);
  ok(`已从 ${count} 个窗口移除皮肤`);
}

function cmdCss() {
  // Read-only: exporting a stylesheet must not rewrite the saved config.
  const config = loadConfig();
  patchFromArgs({}); // validate --card early, but keep the result local
  const card = option("card", config.card);
  const scheme = option("scheme", "light");
  const out = option("out");
  const withFonts = !flag("no-fonts");

  const fonts = {};
  if (withFonts) {
    for (const [key, rel, mime] of [
      ["sans", "fonts/InterVariable.woff2", "font/woff2"],
      ["serif", "fonts/SourceSerif4Variable.woff2", "font/woff2"],
      ["mono", "fonts/JetBrainsMonoVariable.ttf", "font/ttf"],
    ]) {
      const file = path.join(ASSETS, rel);
      if (fs.existsSync(file)) {
        fonts[key] = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
      }
    }
  }

  const text = [
    withFonts ? buildFontFaceCss(fonts) : "",
    buildCss({ card, scheme, useFonts: withFonts, mascot: config.mascot }),
    // Sans headings are the shipping default, so the serif sheet is opt-in here
    // exactly as it is in the panel.
    flag("serif") ? serifCss(withFonts) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (out) {
    const target = path.resolve(out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
    ok(`已写出 ${target}（${(text.length / 1024).toFixed(0)} KB，card=${card} scheme=${scheme}）`);
  } else {
    process.stdout.write(text);
  }
}

/**
 * Resident mode is an *MCP server declared in the plugin manifest*: ZCode spawns
 * it at startup and keeps it, so the skin's lifetime matches the app's. There is
 * nothing to install and no daemon to babysit — this command only reports on it,
 * and can stop a stale one left by an older build.
 */
async function cmdShot() {
  const config = loadConfig();
  const out = option("out", path.join(ASSETS, "..", ".preview", `live-${Date.now()}.png`));
  const result = await captureScreenshot(config, out);
  ok(`已截图 ${result.file}（${(result.bytes / 1024).toFixed(0)} KB）`);
}

async function cmdResident() {
  const action = args[1] || "status";
  const configPath = path.join(
    os.homedir(), ".zcode", "cli", "config.json"
  );
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      return {};
    }
  };

  if (action === "status") {
    const cfg = read();
    const plugins = cfg.plugins || {};
    const enabled = plugins["zcode-claude-style@zcode-claude-style"];
    console.log(`插件启用   ${enabled === false ? "已禁用" : "已启用（或未登记）"}`);
    console.log(`清单声明   .zcode-plugin/plugin.json → mcpServers.zcode-claude-style`);
    const logFile = path.join(dataDir(), "mcp.log");
    if (fs.existsSync(logFile)) {
      const tail = fs
        .readFileSync(logFile, "utf8")
        .trim()
        .split(/\r?\n/)
        .slice(-6);
      console.log("最近日志（MCP host）：");
      for (const line of tail) console.log(`  ${line}`);
    } else {
      console.log("尚未运行 —— 重启 ZCode 后它会随插件自动拉起。");
    }
    const loopRunning = await (async () => {
      try {
        const { execFileSync } = await import("node:child_process");
        const out = execFileSync(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-Command",
           `@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
              Where-Object { $_.CommandLine -match 'mcp[\\/]server' }).Count`],
          { encoding: "utf8", windowsHide: true }
        );
        return Number(out.trim());
      } catch {
        return 0;
      }
    })();
    console.log(`运行中     ${loopRunning > 0 ? `是（${loopRunning} 个 MCP host 进程）` : "否"}`);
    return;
  }

  if (action === "off") {
    // A stale host from an old build would fight the manifest-declared one.
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-Command",
         `Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Where-Object { $_.CommandLine -match 'mcp[\\/]server' } |
          ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`],
        { encoding: "utf8", windowsHide: true }
      );
      ok("已停止所有 MCP host 进程（重启 ZCode 会重新拉起）");
    } catch (err) {
      console.error(`! ${String(err.message || err)}`);
    }
    return;
  }

  fail(`未知动作 "${action}"，可用：status | off`);
}

function cmdHelp() {
  console.log(`zcode-claude-style — 把 Claude Code Desktop 的观感搬到 ZCode

用法
  zcode-claude-style apply   [--card claude|deepseek] [--no-mascot] [--no-fonts] [--no-motion] [--serif] [--port 9222]
  zcode-claude-style launch  [同上]
  zcode-claude-style status
  zcode-claude-style reset
  zcode-claude-style css     [--card ..] [--scheme light|dark] [--serif] [--out file]
  zcode-claude-style shot    [--out file]   截取当前窗口（验收用）
  zcode-claude-style resident [status|off]  常驻 MCP host 的状态

说明
  ZCode 生产版没有内置调试端口，首次使用必须用 launch 启动一次（或用带该参数的快捷方式）。

  常驻：插件清单声明了 mcpServers，ZCode 启动时会自动拉起 src/mcp/server.mjs，
  它开机注入一次、之后每 4 秒巡检，窗口重载 / 皮肤丢失会自动补上。
  用 resident status 看它在不在。设置入口是侧栏「cc-风格」那一行。

  字体族：默认全衬线（Noto Serif 覆盖正文/标题/界面，代码块始终等宽）。
  不喜欢衬线就用 --no-serif 回到 Inter，或在「cc-风格」面板关掉「衬线字体」。`);}

const commands = {
  apply: cmdApply,
  launch: cmdLaunch,
  status: cmdStatus,
  reset: cmdReset,
  css: cmdCss,
  shot: cmdShot,
  resident: cmdResident,
  help: cmdHelp,
};

const run = commands[command];
if (!run) {
  console.error(`未知命令 "${command}"\n`);
  cmdHelp();
  process.exit(1);
}

Promise.resolve(run()).catch((err) => {
  console.error(`✗ ${err.message}`);
  if (process.env.ZCS_DEBUG) console.error(err.stack);
  process.exit(1);
});

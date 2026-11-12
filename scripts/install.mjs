#!/usr/bin/env node
/**
 * Registers this folder as a local ZCode plugin marketplace and installs the
 * plugin into ZCode's cache, reproducing what the Plugin Management UI does:
 *
 *   1. stage a marketplace copy   ~/.zcode/cli/plugins/marketplaces/<id>/
 *   2. register it                known_marketplaces.json
 *   3. cache the plugin           cache/<marketplace>/<plugin>/<version>/
 *   4. record the install         installed_plugins.json
 *
 * Idempotent: re-running updates the same entries. Every file it rewrites is
 * backed up first (`*.bak-<timestamp>`), and nothing outside the plugin data
 * directories is touched.
 *
 *   node scripts/install.mjs [--dry-run] [--uninstall]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS = path.join(os.homedir(), ".zcode", "cli", "plugins");
const MARKETPLACE_ID = "zcode-claude-style";
const DRY = process.argv.includes("--dry-run");
const UNINSTALL = process.argv.includes("--uninstall");

const SKIP = new Set([".git", "node_modules", ".preview", "verify.log", "dist"]);

function log(msg) {
  console.log(`${DRY ? "[dry-run] " : ""}${msg}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function backup(file) {
  if (DRY || !fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, target);
  log(`  备份 ${path.basename(file)} → ${path.basename(target)}`);
}

function writeJson(file, value) {
  if (DRY) {
    log(`  写入 ${file}`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyTree(from, to) {
  if (DRY) {
    log(`  复制 ${from} → ${to}`);
    return;
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return !SKIP.has(name);
    },
  });
}

const manifest = readJson(path.join(ROOT, ".zcode-plugin", "plugin.json"), null);
if (!manifest) {
  console.error(`找不到 ${path.join(ROOT, ".zcode-plugin", "plugin.json")}`);
  process.exit(1);
}
const version = manifest.version || "0.1.0";
const now = new Date().toISOString();

const KNOWN = path.join(PLUGINS, "known_marketplaces.json");
const INSTALLED = path.join(PLUGINS, "installed_plugins.json");
const MARKET_DIR = path.join(PLUGINS, "marketplaces", MARKETPLACE_ID);
const CACHE_DIR = path.join(PLUGINS, "cache", MARKETPLACE_ID, MARKETPLACE_ID, version);

if (UNINSTALL) {
  log(`卸载 ${MARKETPLACE_ID}`);
  const known = readJson(KNOWN, { version: 1, marketplaces: [] });
  known.marketplaces = (known.marketplaces || []).filter((m) => m.id !== MARKETPLACE_ID);
  backup(KNOWN);
  writeJson(KNOWN, known);

  const installed = readJson(INSTALLED, { version: 1, plugins: [] });
  installed.plugins = (installed.plugins || []).filter(
    (p) => p.marketplace !== MARKETPLACE_ID
  );
  backup(INSTALLED);
  writeJson(INSTALLED, installed);

  if (!DRY) {
    fs.rmSync(path.join(PLUGINS, "cache", MARKETPLACE_ID), { recursive: true, force: true });
    fs.rmSync(MARKET_DIR, { recursive: true, force: true });
  }
  log("完成。重启 ZCode 后插件即从列表消失。");
  process.exit(0);
}

log(`安装 ${MARKETPLACE_ID}@${version}`);
log(`源目录 ${ROOT}`);

// 1. stage the marketplace copy
log("1) 暂存市场副本");
copyTree(ROOT, MARKET_DIR);

// 2. register the marketplace
log("2) 注册市场");
{
  const known = readJson(KNOWN, { version: 1, marketplaces: [] });
  known.version = known.version || 1;
  known.marketplaces = known.marketplaces || [];
  const entry = {
    id: MARKETPLACE_ID,
    source: { source: "directory", path: ROOT },
    name: MARKETPLACE_ID,
    description:
      "Claude Code Desktop look for the ZCode desktop client — ported from dsh-claude-style's design tokens.",
    addedAt: now,
    pluginCount: 1,
    lastUpdated: now,
  };
  const index = known.marketplaces.findIndex((m) => m.id === MARKETPLACE_ID);
  if (index === -1) known.marketplaces.push(entry);
  else known.marketplaces[index] = { ...known.marketplaces[index], ...entry, addedAt: known.marketplaces[index].addedAt };
  backup(KNOWN);
  writeJson(KNOWN, known);
}

// 3. cache the plugin
log("3) 缓存插件");
copyTree(ROOT, CACHE_DIR);
// Drop older versions so the plugin list never shows two copies of this skin.
{
  const pluginCache = path.dirname(CACHE_DIR);
  if (fs.existsSync(pluginCache)) {
    for (const entry of fs.readdirSync(pluginCache)) {
      if (entry !== version && fs.statSync(path.join(pluginCache, entry)).isDirectory()) {
        log(`  清理旧版本 ${entry}`);
        if (!DRY) fs.rmSync(path.join(pluginCache, entry), { recursive: true, force: true });
      }
    }
  }
}

// 4. record the install
log("4) 登记安装");
{
  const installed = readJson(INSTALLED, { version: 1, plugins: [] });
  installed.version = installed.version || 1;
  installed.plugins = installed.plugins || [];
  const record = {
    id: `${MARKETPLACE_ID}@${MARKETPLACE_ID}`,
    name: MARKETPLACE_ID,
    marketplace: MARKETPLACE_ID,
    version,
    installPath: CACHE_DIR,
    installedAt: now,
    updatedAt: now,
    scope: "user",
  };
  const index = installed.plugins.findIndex(
    (p) => p.id === `${MARKETPLACE_ID}@${MARKETPLACE_ID}`
  );
  if (index === -1) installed.plugins.push(record);
  else installed.plugins[index] = { ...installed.plugins[index], ...record, installedAt: installed.plugins[index].installedAt };
  backup(INSTALLED);
  writeJson(INSTALLED, installed);
}

log("");
log(`完成。插件目录：${CACHE_DIR}`);
log("下一步：完全退出 ZCode（含托盘），再启动；然后用 /claude-style 或");
log(`  node "${path.join(CACHE_DIR, "src", "cli.mjs")}" launch`);

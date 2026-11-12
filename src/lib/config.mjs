/**
 * Config lives beside the plugin, under ZCode's plugin data directory when the
 * plugin runs from ZCode (${ZCODE_PLUGIN_DATA}) and under ~/.zcode otherwise,
 * so a CLI run and a plugin run do not drift into two files.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_CONFIG = {
  port: 9222,
  card: "claude",
  mascot: true,
  fonts: true,
  motion: true,
  // The whole interface in serif; --no-serif switches back to Inter.
  serif: true,
};

export function dataDir() {
  const override = process.env.ZCODE_CLAUDE_STYLE_DATA_DIR;
  if (override) return override;
  const root = path.join(os.homedir(), ".zcode", "cli", "plugins", "data");
  const scoped = path.join(root, "zcode-claude-style@zcode-claude-style");
  if (fs.existsSync(scoped)) return scoped;
  return path.join(root, "zcode-claude-style");
}

export function configFile() {
  return path.join(dataDir(), "config.json");
}

export function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFile(), "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

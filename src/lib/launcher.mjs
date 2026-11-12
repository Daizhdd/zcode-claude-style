/**
 * Starts ZCode with a debug port.
 *
 * Production ZCode has no CDP endpoint (the dev build hard-codes 9229 only when
 * unpackaged), and it enforces a single instance: a second launch forwards its
 * argv to the running process and exits, closing the port again. So this
 * refuses to race an existing instance and asks for a restart instead.
 */

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { listTargets } from "./cdp.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATES =
  process.platform === "win32"
    ? [
        process.env.ZCODE_WINDOWS_APP_INSTALL_DIR
          ? path.join(process.env.ZCODE_WINDOWS_APP_INSTALL_DIR, "ZCode.exe")
          : undefined,
        "D:\\zcode\\ZCode.exe",
        "C:\\Program Files\\ZCode\\ZCode.exe",
        path.join(os.homedir(), "AppData", "Local", "Programs", "ZCode", "ZCode.exe"),
      ].filter(Boolean)
    : process.platform === "darwin"
      ? ["/Applications/ZCode.app/Contents/MacOS/ZCode"]
      : ["/usr/bin/zcode", "/opt/ZCode/zcode"];

export function findZcodeExecutable() {
  return CANDIDATES.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

export async function isZcodeRunning() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI",
        "IMAGENAME eq ZCode.exe",
        "/NH",
      ]);
      return /zcode\.exe/i.test(stdout);
    }
    const { stdout } = await execFileAsync("pgrep", ["-fl", "ZCode"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function probePort(port) {
  try {
    const targets = await listTargets(port);
    return targets.length > 0;
  } catch {
    return false;
  }
}

/** Waits until the CDP endpoint answers, or throws after `timeoutMs`. */
export async function waitForPort(port, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probePort(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * @returns {Promise<{launched: boolean, executable?: string, reason?: string}>}
 */
export async function launchWithDebugPort(port) {
  if (await probePort(port)) {
    return { launched: false, reason: "调试端口已经在监听，直接注入即可" };
  }
  if (await isZcodeRunning()) {
    return {
      launched: false,
      reason:
        "ZCode 正在运行但没有调试端口。单实例锁会让新的启动参数被丢弃，请先完全退出 ZCode（含托盘），再运行 launch",
    };
  }
  const exe = findZcodeExecutable();
  if (!exe) {
    return { launched: false, reason: "没有找到 ZCode 的可执行文件，请设置 ZCODE_WINDOWS_APP_INSTALL_DIR" };
  }

  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  const ok = await waitForPort(port);
  if (!ok) {
    return {
      launched: false,
      executable: exe,
      reason: `已启动 ${exe}，但 ${port} 端口在 45 秒内没有响应`,
    };
  }
  return { launched: true, executable: exe };
}

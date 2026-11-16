#!/usr/bin/env node
/**
 * zcode-claude-style · resident host process.
 *
 * Declared in `.zcode-plugin/plugin.json` under `mcpServers`, so **ZCode itself
 * spawns and supervises this process** at startup. That is the whole point: the
 * skin only matters while ZCode is running, and this process lives exactly that
 * long. No Scheduled Task, no cron, no "did the daemon survive?" question — the
 * lifetime is the app's.
 *
 * On start it does one injection, then keeps a light watch loop so a window
 * reload (which drops injected CSS) heals within seconds.
 *
 * MCP is implemented by hand over stdio: the protocol is line-delimited
 * JSON-RPC, and the plugin must run from a bare `node` with no install step.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig, dataDir } from "../lib/config.mjs";
import { applyToRunning, buildAt, readStatus, resetRunning, styleId } from "../lib/inject.mjs";
import { launchWithDebugPort } from "../lib/launcher.mjs";
import { resolvePort } from "../lib/cdp.mjs";
import { CARDS } from "../theme/palette.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_FILE = path.join(dataDir(), "mcp.log");
/*
 * Two speeds, because the two situations have nothing in common in cost terms.
 *
 * Healthy: the probe costs ~12ms (one local HTTP call plus one Runtime.evaluate
 * over a fresh websocket). Every 4 seconds that is 21 600 wakes a day for an
 * answer that changes maybe twice. 30s is 2 880, and nothing visible is lost —
 * the skin does not decay on its own.
 *
 * Broken: a window reload drops the injected stylesheet and there is nothing to
 * restore from (the injected script dies with its CDP session), so the wait is
 * user-visible. Two seconds makes that recovery feel immediate.
 */
const WATCH_HEALTHY_MS = Number(process.env.ZCS_WATCH_INTERVAL || 30000);
const WATCH_RECOVER_MS = Number(process.env.ZCS_WATCH_RECOVER || 2000);
// No debug port at all: the failure is instant and the user may leave it this way
// for a whole session, so back off rather than retry every two seconds.
const WATCH_IDLE_MS = Number(process.env.ZCS_WATCH_IDLE || 10000);
const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "zcode-claude-style", version: "0.9.1" };

let watchTimer = null;
let lastState = null;
let watcherOn = true;
/** In-flight request handlers; see the stdin "end" drain. */
const pending = new Set();

// ------------------------------------------------------------------ logging

function log(line) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    // Logging must never take the host process down.
  }
}

// Never write anything to stdout except JSON-RPC frames: stdout *is* the
// transport. A stray console.log here corrupts the protocol stream.
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ------------------------------------------------------------------- watch

/**
 * One pass: inject when the skin is missing, stay quiet otherwise. Every probe
 * is guarded — a failure here must not kill the MCP host and take the plugin's
 * settings UI down with it.
 */
async function watchPass() {
  if (!watcherOn) return WATCH_HEALTHY_MS;
  const config = loadConfig();
  try {
    const status = await readStatus(config);
    if (!status) {
      stateOnce("no-target", "CDP up, no renderer target yet");
      return WATCH_IDLE_MS;
    }
    if (status.skin) {
      /*
       * The skin is up, but is it the *current* skin? The plugin directory can
       * be edited (a token, a motion rule) without the window reloading, and a
       * host that only checks "is there a style element" would happily leave
       * the user on yesterday's stylesheet forever.
       *
       * The timestamp guard is what keeps two injectors civil: this host only
       * takes over a window stamped earlier than its own build. Without it, a
       * host left running from an older plugin build would see a newer sheet,
       * call it stale, and overwrite it — in a loop.
       */
      const current = styleId();
      const mineAt = buildAt();
      const windowAt = Number(status.styleAt || 0);
      if (status.styleId !== current && windowAt < mineAt) {
        const result = await applyToRunning(config);
        stateOnce(
          `stale:${current}`,
          `stylesheet moved to ${current} — re-injected ${result.applied}/${result.total}`
        );
        // Come back soon to confirm the push actually took.
        return WATCH_RECOVER_MS;
      }
      if (status.styleId !== current) {
        // Someone newer than us owns this window. Stand down and say so once.
        stateOnce(
          `newer:${status.styleId}`,
          `window carries a newer skin (${status.styleId}) — leaving it alone`
        );
        return WATCH_HEALTHY_MS;
      }
      stateOnce(`ok:${status.skin}:${status.scheme}`, `skin online (${status.skin}/${status.scheme})`);
      return WATCH_HEALTHY_MS;
    }
    const result = await applyToRunning(config);
    stateOnce("injected", `injected into ${result.applied}/${result.total} renderer(s)`);
    return WATCH_RECOVER_MS;
  } catch (err) {
    const msg = String(err?.message || err).split("\n")[0];
    if (/连不上|CDP/.test(msg)) {
      stateOnce("no-port", "waiting for a debug port");
      // A closed port is a fast failure; no point hammering it, and the user may
      // sit like this for hours if they launched ZCode without the flag.
      return WATCH_IDLE_MS;
    }
    stateOnce(`error:${msg}`, `error: ${msg}`);
    return WATCH_RECOVER_MS;
  }
}

function stateOnce(state, line) {
  if (lastState === state) return;
  lastState = state;
  log(line);
}

const WATCH_LOCK = path.join(dataDir(), "watch.lock");

/**
 * ZCode spawns one MCP host per session, so several of these can be alive at
 * once. Each must answer its own stdio, but only one should poll CDP — a lock
 * file elects the poller and the rest stand by.
 *
 * Staleness is detected by probing the recorded pid (signal 0); a killed host
 * leaves a lock behind, and the next one takes over.
 */
function acquireWatchLock() {
  try {
    if (fs.existsSync(WATCH_LOCK)) {
      const holder = JSON.parse(fs.readFileSync(WATCH_LOCK, "utf8"));
      if (holder.pid && holder.pid !== process.pid) {
        try {
          process.kill(holder.pid, 0);
          return false; // a live host already polls
        } catch {
          // Stale: the previous holder died. Take over.
        }
      }
    }
    fs.mkdirSync(path.dirname(WATCH_LOCK), { recursive: true });
    fs.writeFileSync(WATCH_LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }), "utf8");
    return true;
  } catch {
    // Lock trouble must not disable the skin; worst case two poll harmlessly.
    return true;
  }
}

function releaseWatchLock() {
  try {
    const holder = JSON.parse(fs.readFileSync(WATCH_LOCK, "utf8"));
    if (holder.pid === process.pid) fs.rmSync(WATCH_LOCK);
  } catch {}
}

function startWatch() {
  if (watchTimer) return;
  watcherOn = true;

  if (!acquireWatchLock()) {
    // Another host owns the loop. Tools still work; injection stays idempotent.
    // Logged once per state change: the retry runs every few seconds and would
    // otherwise flood the log for the life of the session.
    stateOnce("deferred", "watch loop deferred — another MCP host is polling");
    return;
  }
  if (lastState === "deferred") lastState = null;

  if (lastState === "deferred") lastState = null;

  // Self-scheduling rather than setInterval: each pass decides its own next
  // delay, which is what makes the two speeds possible (30s healthy, 2s while
  // something is actually broken). A fixed interval cannot express that.
  const tick = async () => {
    const delay = await watchPass();
    if (!watcherOn) return;
    watchTimer = setTimeout(tick, Number.isFinite(delay) ? delay : WATCH_HEALTHY_MS);
    // Do not hold the event loop open on its own: stdin keeps the process alive,
    // and this timer must not become the reason it never exits.
    watchTimer.unref?.();
  };
  watchTimer = setTimeout(tick, 0);
  watchTimer.unref?.();
  log(
    `watch loop started (healthy ${WATCH_HEALTHY_MS}ms / recover ${WATCH_RECOVER_MS}ms / idle ${WATCH_IDLE_MS}ms, pid ${process.pid})`
  );
}

function stopWatch() {
  watcherOn = false;
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = null;
  releaseWatchLock();
  log("watch loop stopped");
}

// -------------------------------------------------------------------- tools

const TOOLS = [
  {
    name: "claude_style_status",
    description:
      "Report whether the Claude Style skin is applied to the running ZCode window, plus the active colour card, scheme and settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "claude_style_apply",
    description:
      "Apply or update the skin on the running ZCode window. Requires ZCode to have been started with --remote-debugging-port.",
    inputSchema: {
      type: "object",
      properties: {
        card: { type: "string", enum: Object.keys(CARDS), description: "Colour card to use." },
        mascot: { type: "boolean", description: "Show the Deepy whale." },
        fonts: { type: "boolean", description: "Use the bundled Inter / JetBrains Mono faces." },
        serif: { type: "boolean", description: "Serif (Noto) headings instead of sans." },
        motion: { type: "boolean", description: "Enable the CSS motion layer." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "claude_style_reset",
    description: "Remove the skin from the running ZCode window and restore the host's own look.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "claude_style_launch",
    description:
      "Start ZCode with the debug port the skin needs, then inject. Fails if ZCode is already running without the port (single-instance lock).",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", description: "CDP port, default 9222." } },
      additionalProperties: false,
    },
  },
  {
    name: "claude_style_watch",
    description:
      "Turn the resident watcher on or off. When on, the skin is re-applied within seconds of a window reload.",
    inputSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
  },
];

function text(value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

function failure(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function callTool(name, args) {
  switch (name) {
    case "claude_style_status": {
      const config = loadConfig();
      let live = null;
      let portUp = false;
      // Report the port that actually answered, not the pinned one: the two
      // diverge whenever ZCode was launched without --remote-debugging-port.
      let activePort = null;
      try {
        activePort = await resolvePort(config.port);
        portUp = activePort !== null;
        live = portUp ? await readStatus({ ...config, port: activePort }) : null;
      } catch (err) {
        live = { error: String(err.message || err) };
      }
      return text({
        config,
        port: activePort ?? config.port,
        portUp,
        applied: Boolean(live?.skin),
        live,
        watcher: watcherOn,
        logFile: LOG_FILE,
      });
    }

    case "claude_style_apply": {
      const patch = {};
      if (args?.card) {
        if (!CARDS[args.card]) {
          return failure(`未知色卡 "${args.card}"，可选：${Object.keys(CARDS).join(" / ")}`);
        }
        patch.card = args.card;
      }
      if (typeof args?.mascot === "boolean") patch.mascot = args.mascot;
      if (typeof args?.fonts === "boolean") patch.fonts = args.fonts;
      if (typeof args?.serif === "boolean") patch.serif = args.serif;
      if (typeof args?.motion === "boolean") patch.motion = args.motion;
      const config = Object.keys(patch).length ? saveConfig(patch) : loadConfig();
      try {
        const result = await applyToRunning(config);
        lastState = null;
        return text({ applied: result.applied, windows: result.total, config });
      } catch (err) {
        return failure(
          `${err.message}\n\n提示：ZCode 需要以 --remote-debugging-port=${config.port} 启动；` +
            `已在运行但没端口时，先在托盘完全退出，再用 claude_style_launch。`
        );
      }
    }

    case "claude_style_reset": {
      const config = loadConfig();
      try {
        const count = await resetRunning(config);
        lastState = null;
        return text({ removedFrom: count });
      } catch (err) {
        return failure(err.message);
      }
    }

    case "claude_style_launch": {
      const patch = typeof args?.port === "number" ? { port: args.port } : {};
      const config = Object.keys(patch).length ? saveConfig(patch) : loadConfig();
      const result = await launchWithDebugPort(config.port);
      if (!result.launched && /正在运行/.test(result.reason || "")) {
        return failure(`${result.reason}\n先在任务栏托盘完全退出 ZCode，再重试。`);
      }
      if (!result.launched && !/已经在监听/.test(result.reason || "")) {
        return failure(result.reason || "启动失败");
      }
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const injected = await applyToRunning(config);
        return text({ launched: result.launched, applied: injected.applied, windows: injected.total });
      } catch (err) {
        return failure(`已启动但注入失败：${err.message}`);
      }
    }

    case "claude_style_watch": {
      if (args?.enabled) startWatch();
      else stopWatch();
      return text({ watcher: watcherOn });
    }

    default:
      return failure(`未知工具 "${name}"`);
  }
}

// --------------------------------------------------------------------- rpc

async function handle(message) {
  const { id, method, params } = message;

  // Notifications carry no id and take no reply.
  if (id === undefined || id === null) {
    return;
  }

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;

    case "ping":
      reply(id, {});
      return;

    case "tools/list":
      reply(id, { tools: TOOLS });
      return;

    case "tools/call": {
      const name = params?.name;
      try {
        reply(id, await callTool(name, params?.arguments || {}));
      } catch (err) {
        reply(id, failure(String(err?.message || err)));
      }
      return;
    }

    default:
      // Unknown methods must not kill the transport: answer method-not-found.
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

// -------------------------------------------------------------------- boot

async function main() {
  log(`mcp host start (pid ${process.pid}, cwd ${process.cwd()})`);

  // Inject first, then watch. Deliberately fire-and-forget so the MCP handshake
  // is never blocked behind a slow CDP round trip.
  startWatch();
  // If another host owns the poll loop, keep retrying the lock so this one takes
  // over within a few seconds of that host exiting (session closed, crash).
  // Fixed 5s: this is a cheap file read plus a pid probe, not a CDP round trip.
  setInterval(() => {
    if (!watchTimer) startWatch();
  }, 5000).unref?.();

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        log(`bad frame: ${line.slice(0, 120)}`);
        continue;
      }
      // Tracked so a stdin close can wait for an in-flight tool call instead of
      // cutting its reply off mid-write.
      const task = handle(message).catch((err) => log(`handler error: ${err?.message || err}`));
      pending.add(task);
      task.finally(() => pending.delete(task));
    }
  });

  process.stdin.on("end", async () => {
    log("stdin closed — draining in-flight calls");
    const drained = await Promise.race([
      Promise.allSettled(pending),
      new Promise((r) => setTimeout(() => r("timeout"), 5000)),
    ]);
    if (drained === "timeout") log("drain timed out, exiting anyway");
    stopWatch();
    process.exit(0);
  });

  // ZCode closing kills the tree; log it so the log explains a gap.
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
    process.on(sig, () => {
      log(`signal ${sig} — exiting`);
      stopWatch();
      process.exit(0);
    });
  }

  process.on("uncaughtException", (err) => log(`uncaught: ${err?.stack || err}`));
  process.on("unhandledRejection", (err) => log(`unhandled rejection: ${err?.message || err}`));
}

main();

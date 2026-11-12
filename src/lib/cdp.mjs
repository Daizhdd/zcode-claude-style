/**
 * Minimal CDP client, scoped to what the skin needs: list targets, attach to
 * the chat renderer, evaluate a script, and register a new-document script so
 * the skin survives a window reload for as long as the session lives.
 *
 * Node 20+ provides `fetch` and a global `WebSocket`, so this carries no
 * dependency on purpose — the plugin has to run from a bare `node`.
 */

export class CdpError extends Error {}

export async function listTargets(port, host = "127.0.0.1") {
  let res;
  try {
    res = await fetch(`http://${host}:${port}/json/list`, {
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    throw new CdpError(
      `连不上 ${host}:${port} 的 CDP —— ZCode 需要以 --remote-debugging-port=${port} 启动`
    );
  }
  if (!res.ok) throw new CdpError(`CDP /json/list 返回 HTTP ${res.status}`);
  return res.json();
}

/** The main chat window; helper pages and devtools are skipped. */
export function pickRendererTargets(targets) {
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  const main = pages.filter(
    (t) =>
      (t.url || "").includes("out/renderer") ||
      (t.title || "") === "ZCode" ||
      (t.url || "").includes("index.html")
  );
  return main.length > 0 ? main : pages.filter((t) => !(t.url || "").startsWith("devtools://"));
}

export class CdpConnection {
  #ws;
  #nextId = 1;
  #pending = new Map();

  constructor(wsUrl) {
    this.#ws = new WebSocket(wsUrl);
    this.#ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const p = this.#pending.get(msg.id);
        if (!p) return;
        this.#pending.delete(msg.id);
        if (msg.error) p.reject(new CdpError(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
      }
    });
    this.#ws.addEventListener("close", () => {
      for (const p of this.#pending.values()) p.reject(new CdpError("CDP 连接已关闭"));
      this.#pending.clear();
    });
  }

  static connect(wsUrl, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let conn;
      try {
        conn = new CdpConnection(wsUrl);
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        conn.close();
        reject(new CdpError("CDP websocket 连接超时"));
      }, timeoutMs);
      conn.raw.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve(conn);
        },
        { once: true }
      );
      conn.raw.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new CdpError(`CDP websocket 连接失败: ${wsUrl}`));
        },
        { once: true }
      );
    });
  }

  get raw() {
    return this.#ws;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.#ws.close();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Read-only probe: one `Runtime.evaluate`, nothing else.
 *
 * Deliberately does NOT enable any domain and does NOT register a script. The
 * resident host calls this every few seconds just to ask "is the skin still
 * there?", and the injection path's extra three commands (`Runtime.enable`,
 * `Page.enable`, `addScriptToEvaluateOnNewDocument`) cost about as much as the
 * evaluate itself — measured 22.9ms per probe versus 12ms for this shape.
 * `Runtime.enable` in particular makes the renderer enumerate execution
 * contexts and start tracking heap objects, which is real work to do every few
 * seconds for a yes/no answer.
 */
export async function probeInTarget(target, expression) {
  const conn = await CdpConnection.connect(target.webSocketDebuggerUrl);
  try {
    const result = await conn.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    if (result?.exceptionDetails) {
      throw new CdpError(
        `渲染进程求值失败: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`
      );
    }
    return result?.result?.value;
  } finally {
    conn.close();
  }
}

/**
 * Injects `source` into a renderer: it runs now and again on every reload
 * (`addScriptToEvaluateOnNewDocument` stays registered for this session).
 */
export async function evaluateInTarget(target, source) {
  const conn = await CdpConnection.connect(target.webSocketDebuggerUrl);
  try {
    await conn.send("Runtime.enable");
    await conn.send("Page.enable");
    await conn.send("Page.addScriptToEvaluateOnNewDocument", { source });
    const result = await conn.send("Runtime.evaluate", {
      expression: source,
      returnByValue: true,
      awaitPromise: false,
    });
    if (result?.exceptionDetails) {
      throw new CdpError(
        `渲染进程执行失败: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`
      );
    }
    return result?.result?.value;
  } finally {
    conn.close();
  }
}

#!/usr/bin/env node
/**
 * Dev helper: evaluates a JS expression in the live ZCode renderer and prints
 * the result. Saves fighting bash escaping when inspecting the DOM.
 *
 *   node scripts/probe.mjs "<js expression>"
 *   node scripts/probe.mjs --file probe.js
 */

import fs from "node:fs";
import { listTargets, pickRendererTargets, CdpConnection } from "../src/lib/cdp.mjs";
import { loadConfig } from "../src/lib/config.mjs";

const config = loadConfig();
const fileIndex = process.argv.indexOf("--file");
const expression =
  fileIndex !== -1 ? fs.readFileSync(process.argv[fileIndex + 1], "utf8") : process.argv[2];

if (!expression) {
  console.error("用法: node scripts/probe.mjs \"<expression>\" | --file <file.js>");
  process.exit(1);
}

const targets = pickRendererTargets(await listTargets(config.port));
if (targets.length === 0) {
  console.error("没有可用的 ZCode 渲染进程");
  process.exit(1);
}

const conn = await CdpConnection.connect(targets[0].webSocketDebuggerUrl);
try {
  const result = await conn.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    console.error(JSON.stringify(result.exceptionDetails, null, 2));
    process.exit(1);
  }
  const value = result.result?.value;
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
} finally {
  conn.close();
}

#!/usr/bin/env node
// Starts the Vite dev server, then opens it in the Electron desktop window.
// Edits to src/ hot-reload in the window. Closing the window stops everything.

import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronBin = require("electron"); // resolves to the Electron executable path

const server = await createServer({ root, server: { strictPort: false } });
await server.listen();
const url = server.resolvedUrls?.local?.[0] || `http://localhost:${server.config.server.port}/`;
console.log(`vite: ${url}`);

const child = spawn(electronBin, [root], {
  stdio: "inherit",
  env: { ...process.env, OPENCOURSE_DEV_URL: url },
});

const stop = async (code = 0) => {
  await server.close();
  process.exit(code);
};
child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());

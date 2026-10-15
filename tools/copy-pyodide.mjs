#!/usr/bin/env node
// Copies the core Pyodide runtime from node_modules into public/pyodide/ so it
// is bundled into the app (Vite copies public/ into dist/, and Capacitor bundles
// dist/ into the APK). This lets "Run" execute Python fully offline — no CDN.
// Only the core + stdlib are copied (no package wheels), which is all that's
// needed to run standard-library Python.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "pyodide");
const dest = path.join(root, "public", "pyodide");

const FILES = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!fs.existsSync(src)) {
  console.error("pyodide is not installed (run: npm install). Skipping copy.");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of FILES) {
  const from = path.join(src, f);
  const to = path.join(dest, f);
  if (!fs.existsSync(from)) {
    console.error(`  missing ${f} in pyodide package`);
    continue;
  }
  // Skip the copy if the destination is already up to date.
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
  fs.copyFileSync(from, to);
  copied++;
}
console.log(`pyodide: ${copied} file(s) copied to public/pyodide/`);

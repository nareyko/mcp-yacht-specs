#!/usr/bin/env node
/**
 * Ensure dist/index.js is executable in the published tarball.
 * Without +x, `npx -y @nareyko/mcp-yacht-specs` fails with:
 *   sh: fairhelm-mcp-yacht-specs: not found
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distIndex = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
fs.chmodSync(distIndex, 0o755);
const mode = fs.statSync(distIndex).mode & 0o777;
if ((mode & 0o111) === 0) {
  console.error(`chmod-bin: ${distIndex} is not executable (mode=${mode.toString(8)})`);
  process.exit(1);
}

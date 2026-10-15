#!/usr/bin/env node
/**
 * Full E2E + unit smoke for @nareyko/mcp-yacht-specs:
 * 1. Verifies module exports, 93-model snapshot integrity, dims, coefficients, and 3 survey_checkpoints per model.
 * 2. Spawns the compiled CLI binary via a symlink named `fairhelm-mcp-yacht-specs` (simulating `npx`)
 *    over MCP `StdioClientTransport` and exercises all 5 MCP tools over JSON-RPC stdio.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.join(__dirname, "..", "dist", "index.js");

const mod = await import(pathToFileURL(distIndex).href);
const { TOOL_NAMES, createServer, loadSnapshot } = mod;

assert.equal(Array.isArray(TOOL_NAMES), true, "TOOL_NAMES must be an array");
assert.equal(TOOL_NAMES.length, 5, "Expected 5 MCP tools");

const server = createServer();
assert.ok(server, "createServer() must return an McpServer instance");

const snap = loadSnapshot();
assert.equal(snap.model_count, 93, "Snapshot must contain 93 models");
assert.equal(snap.models.length, 93, "models array length must be 93");
assert.equal(
  snap.models_with_research_dims,
  93,
  "All 93 models must have research dimensions",
);

for (const m of snap.models) {
  assert.ok(m.brand_slug && m.model_slug && m.name, `Missing identity on ${m.brand_slug}/${m.model_slug}`);
  assert.ok(
    Array.isArray(m.survey_checkpoints) && m.survey_checkpoints.length === 3,
    `Expected 3 survey_checkpoints on ${m.brand_slug}/${m.model_slug}`,
  );
  assert.ok(
    m.links?.canonical_model_url?.startsWith("https://fairhelm.com/en/yachts/models/"),
    `Invalid canonical_model_url on ${m.brand_slug}/${m.model_slug}`,
  );
}

// Executable bit must ship in the npm tarball; otherwise real `npx -y` fails with
// `sh: mcp-yacht-specs: not found` (bin shim cannot exec a non-+x target).
fs.chmodSync(distIndex, 0o755);
assert.ok(
  (fs.statSync(distIndex).mode & 0o111) !== 0,
  "dist/index.js must be executable for npm bin / npx",
);

// Symlink + direct exec (no `node` prefix) simulates npx's .bin shim path.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fairhelm-mcp-e2e-"));
const symlinkBin = path.join(tmpDir, "mcp-yacht-specs");
fs.symlinkSync(distIndex, symlinkBin);

const transport = new StdioClientTransport({
  command: symlinkBin,
  args: [],
});

const client = new Client(
  { name: "fairhelm-mcp-e2e-smoke", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);

  const toolsResp = await client.listTools();
  const registeredNames = toolsResp.tools.map((t) => t.name).sort();
  assert.deepEqual(
    registeredNames,
    [...TOOL_NAMES].sort(),
    "Stdio server must expose all 5 MCP tools",
  );

  // 1. yacht_specs_health
  const healthRes = await client.callTool({ name: "yacht_specs_health", arguments: {} });
  const healthJson = JSON.parse(healthRes.content[0].text);
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.mode, "zero-network");
  assert.equal(healthJson.model_count, 93);
  assert.equal(healthJson.models_with_research_dims, 93);

  // 2. list_formula_pointers
  const formulasRes = await client.callTool({ name: "list_formula_pointers", arguments: {} });
  const formulasJson = JSON.parse(formulasRes.content[0].text);
  assert.equal(Array.isArray(formulasJson.formulas), true);
  assert.equal(formulasJson.formulas.length, 5);

  // 3. list_yacht_models (filter by brand & search query)
  const listRes = await client.callTool({
    name: "list_yacht_models",
    arguments: { brand: "hallberg-rassy", limit: 10 },
  });
  const listJson = JSON.parse(listRes.content[0].text);
  assert.equal(listJson.total, 12, "Expected 12 Hallberg-Rassy models in benchmark");
  assert.equal(listJson.models[0].brand_slug, "hallberg-rassy");

  // 4. get_yacht_specs (existing + not_found)
  const hr36Res = await client.callTool({
    name: "get_yacht_specs",
    arguments: { brand: "hallberg-rassy", model: "hr36" },
  });
  const hr36 = JSON.parse(hr36Res.content[0].text);
  assert.equal(hr36.name, "HR 36");
  assert.equal(hr36.loa_m, 10.87);
  assert.equal(hr36.lwl_m, 9.35);
  assert.equal(hr36.coefficients.hull_speed_kn, 7.43);
  assert.equal(hr36.coefficients.comfort_ratio, 29.97);
  assert.equal(hr36.survey_checkpoints.length, 3);

  const missingRes = await client.callTool({
    name: "get_yacht_specs",
    arguments: { brand: "hallberg-rassy", model: "nonexistent-999" },
  });
  const missingJson = JSON.parse(missingRes.content[0].text);
  assert.equal(missingJson.error, "not_found");

  // 5. compute_yacht_coefficients
  const calcRes = await client.callTool({
    name: "compute_yacht_coefficients",
    arguments: {
      loa_m: 10.87,
      lwl_m: 9.35,
      beam_m: 3.55,
      displacement_kg: 7500,
      sail_area_m2: 66,
    },
  });
  const calcJson = JSON.parse(calcRes.content[0].text);
  assert.ok(Math.abs(calcJson.hull_speed_kn - 7.431) < 0.01);
  assert.ok(Math.abs(calcJson.capsize_screening - 1.829) < 0.01);
  assert.ok(Math.abs(calcJson.comfort_ratio - 29.97) < 0.05);
  assert.ok(Math.abs(calcJson.displacement_length_ratio - 255.7) < 0.2);
  assert.ok(calcJson.sail_area_displacement > 15);
} finally {
  await client.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      package: "@nareyko/mcp-yacht-specs",
      mode: "zero-network",
      e2e_stdio_jsonrpc: "passed (5/5 tools + executable .bin symlink simulation)",
      tools: TOOL_NAMES,
      model_count: snap.model_count,
      models_with_research_dims: snap.models_with_research_dims,
      survey_checkpoints_verified: snap.model_count * 3,
      openapi: "openapi/yacht-specs-v1.yaml",
      staticCdn: "/open-data/yacht-specs/v1/",
      apiMirror: "/api/public/v1/yacht-specs",
    },
    null,
    2,
  ),
);

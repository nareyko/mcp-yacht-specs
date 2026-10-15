#!/usr/bin/env node
/**
 * @nareyko/mcp-yacht-specs: Zero-Network MCP tools (bundled JSON snapshot).
 *
 * All tool handlers run locally from the packaged snapshot: no HTTP to
 * api.fairhelm.com, no Postgres. CapEx / BoatAdDecoder is out of scope (S3-01).
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  capsizeScreening,
  comfortRatio,
  displacementLengthRatio,
  hullSpeedKn,
  sailAreaDisplacement,
} from "./formulas.js";
import { getModel, listModels, loadSnapshot } from "./store.js";

export const TOOL_NAMES = [
  "list_yacht_models",
  "get_yacht_specs",
  "list_formula_pointers",
  "compute_yacht_coefficients",
  "yacht_specs_health",
] as const;

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function createServer() {
  const server = new McpServer({
    name: "fairhelm-yacht-specs",
    version: "1.0.0",
  });

  server.tool(
    "yacht_specs_health",
    "Local snapshot health (Zero-Network, no remote API call).",
    {},
    async () => {
      const snap = loadSnapshot();
      return textResult({
        ok: true,
        mode: "zero-network",
        schema_version: snap.schema_version,
        model_count: snap.model_count,
        models_with_research_dims: snap.models_with_research_dims,
        generated_at: snap.generated_at,
      });
    },
  );

  server.tool(
    "list_formula_pointers",
    "Canonical FairHelm formula page URLs (bundled, no network).",
    {},
    async () => textResult({ formulas: loadSnapshot().formulas }),
  );

  server.tool(
    "list_yacht_models",
    "List bundled yacht models (brand/model + canonical fairhelm.com URL).",
    {
      brand: z.string().optional().describe("Brand slug filter"),
      q: z.string().optional().describe("Search brand/model name or slug"),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async (args) => textResult(listModels(args)),
  );

  server.tool(
    "get_yacht_specs",
    "Passport dimensions, FairHelm coefficients and canonical links from the local snapshot. Does not decode listings.",
    {
      brand: z.string().describe("Brand slug, e.g. bavaria"),
      model: z.string().describe("Model slug, e.g. bavaria-41"),
    },
    async ({ brand, model }) => {
      const row = getModel(brand, model);
      if (!row) {
        return textResult({ error: "not_found", brand, model });
      }
      return textResult(row);
    },
  );

  server.tool(
    "compute_yacht_coefficients",
    "Compute FairHelm hydro coefficients locally from dimensions: hull speed, CSF, comfort ratio, D/L, SA/D. No CapEx.",
    {
      lwl_m: z.number().positive().optional(),
      loa_m: z.number().positive().optional(),
      beam_m: z.number().positive().optional(),
      displacement_kg: z.number().positive().optional(),
      sail_area_m2: z.number().positive().optional(),
    },
    async (input) => {
      const lwl = input.lwl_m;
      const loa = input.loa_m;
      const beam = input.beam_m;
      const disp = input.displacement_kg;
      const sa = input.sail_area_m2;
      return textResult({
        hull_speed_kn: lwl != null ? hullSpeedKn(lwl) : null,
        capsize_screening:
          beam != null && disp != null ? capsizeScreening(beam, disp) : null,
        comfort_ratio:
          disp != null && lwl != null && loa != null && beam != null
            ? comfortRatio({
                displacementKg: disp,
                lwlM: lwl,
                loaM: loa,
                beamM: beam,
              })
            : null,
        displacement_length_ratio:
          disp != null && lwl != null
            ? displacementLengthRatio(disp, lwl)
            : null,
        sail_area_displacement:
          sa != null && disp != null ? sailAreaDisplacement(sa, disp) : null,
      });
    },
  );

  return server;
}

export { getModel, listModels, loadSnapshot };
export {
  capsizeScreening,
  comfortRatio,
  displacementLengthRatio,
  hullSpeedKn,
  sailAreaDisplacement,
} from "./formulas.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectInvocation(): boolean {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  const argv1 = process.argv[1];
  try {
    if (fs.realpathSync(argv1) === fileURLToPath(import.meta.url)) return true;
  } catch {
    /* argv may be a broken symlink; fall through */
  }
  return (
    argv1.includes("fairhelm-mcp-yacht-specs") ||
    argv1.includes("mcp-yacht-specs")
  );
}

if (isDirectInvocation()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

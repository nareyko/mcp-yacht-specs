import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

export type YachtSpecsModel = {
  brand_slug: string;
  model_slug: string;
  name: string;
  loa_m: number | null;
  lwl_m: number | null;
  beam_m: number | null;
  draft_m: number | null;
  displacement_kg: number | null;
  ballast_kg: number | null;
  sail_area_m2: number | null;
  production_start_year: number | null;
  production_end_year: number | null;
  designer: string | null;
  keel_type: string | null;
  rig_type: string | null;
  coefficients: Record<string, number | null>;
  survey_checkpoints: string[];
  links: {
    canonical_model_url: string;
    formulas_methodology_url: string;
    survey_service_url: string;
  };
};

export type YachtSpecsSnapshot = {
  schema_version: number;
  generated_at: string;
  source: string;
  model_count: number;
  models_with_research_dims: number;
  formulas: Array<{ slug: string; title: string; url: string }>;
  models: YachtSpecsModel[];
};

const require = createRequire(import.meta.url);

function resolveSnapshotPath(): string {
  const override = process.env.FAIRHELM_YACHT_SPECS_SNAPSHOT;
  if (override && fs.existsSync(override)) return override;
  // Packaged: ../data next to dist/
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "..", "data", "yacht-specs-snapshot.json"),
    path.join(here, "yacht-specs-snapshot.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Fallback via require.resolve when published with "files": ["data"]
  try {
    return require.resolve("../data/yacht-specs-snapshot.json");
  } catch {
    throw new Error(
      "yacht-specs snapshot not found; expected packages/mcp-yacht-specs/data/yacht-specs-snapshot.json",
    );
  }
}

let cached: YachtSpecsSnapshot | null = null;

export function loadSnapshot(): YachtSpecsSnapshot {
  if (cached) return cached;
  const raw = fs.readFileSync(resolveSnapshotPath(), "utf8");
  cached = JSON.parse(raw) as YachtSpecsSnapshot;
  return cached;
}

export function listModels(params: {
  brand?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): {
  total: number;
  limit: number;
  offset: number;
  models: Array<{
    brand_slug: string;
    model_slug: string;
    name: string;
    canonical_model_url: string;
  }>;
} {
  const snap = loadSnapshot();
  const brand = params.brand?.toLowerCase();
  const q = params.q?.toLowerCase().trim();
  let rows = snap.models;
  if (brand) rows = rows.filter((m) => m.brand_slug === brand);
  if (q) {
    rows = rows.filter(
      (m) =>
        m.brand_slug.includes(q) ||
        m.model_slug.includes(q) ||
        m.name.toLowerCase().includes(q),
    );
  }
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const slice = rows.slice(offset, offset + limit);
  return {
    total: rows.length,
    limit,
    offset,
    models: slice.map((m) => ({
      brand_slug: m.brand_slug,
      model_slug: m.model_slug,
      name: m.name,
      canonical_model_url: m.links.canonical_model_url,
    })),
  };
}

export function getModel(brand: string, model: string): YachtSpecsModel | null {
  const snap = loadSnapshot();
  return (
    snap.models.find((m) => m.brand_slug === brand && m.model_slug === model) ??
    null
  );
}

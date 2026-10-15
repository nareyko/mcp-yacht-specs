#!/usr/bin/env node
/**
 * Build Zero-Network yacht-specs snapshot from:
 * - dataset/fairhelm-sailboat-benchmark-2026.json (dims, years, designer, checkpoints, coeffs)
 * - research SQL UPDATEs 5230–5236 (keel_type / rig_type overlay)
 * Local formula parity with FairHelm frontend (no CapEx / no BoatAdDecoder).
 *
 * Package snapshot is the P1 deliverable. CDN / backend mirrors are written for
 * convenience; formal sync ownership stays PKG-P3.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const benchmarkPath = path.join(
  root,
  "dataset/fairhelm-sailboat-benchmark-2026.json",
);
const slugsPath = path.join(
  root,
  "frontend/src/lib/yachts/open-sailboat-benchmark-slugs.ts",
);
const sqlDir = path.join(root, "backend/sql/yachts");
const outPath = path.join(__dirname, "../data/yacht-specs-snapshot.json");

const SITE = "https://fairhelm.com";
const FORMULAS_URL = `${SITE}/en/yachts/formulas/`;
const SURVEY_URL = `${SITE}/en/yachts/services/listing-review/`;

function hullSpeed(lwl) {
  return lwl > 0 ? 2.43 * Math.sqrt(lwl) : null;
}
function csf(beam, disp) {
  return beam > 0 && disp > 0 ? beam / (disp / 1025) ** (1 / 3) : null;
}
function comfort(disp, lwl, loa, beam) {
  if (!(disp > 0 && lwl > 0 && loa > 0 && beam > 0)) return null;
  const dispLb = disp * 2.20462;
  const lwlFt = lwl * 3.28084;
  const loaFt = loa * 3.28084;
  const beamFt = beam * 3.28084;
  const denom = 0.65 * (0.7 * lwlFt + 0.3 * loaFt) * beamFt ** 1.333;
  return denom > 0 ? dispLb / denom : null;
}
function dlRatio(disp, lwl) {
  return disp > 0 && lwl > 0 ? (disp / lwl ** 3) * 27.87 : null;
}
function saDisp(sa, disp) {
  return sa > 0 && disp > 0 ? (sa * 101.65) / disp ** (2 / 3) : null;
}
function round(v, d) {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function parseAllowlist(ts) {
  const refs = [];
  const re =
    /\{\s*brandSlug:\s*"([^"]+)"\s*,\s*modelSlug:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(ts))) {
    refs.push({ brand_slug: m[1], model_slug: m[2] });
  }
  return refs;
}

function parseResearchSql(sqlText) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  const blocks = sqlText.split(/UPDATE yacht_models m SET/i).slice(1);
  for (const block of blocks) {
    const where = block.match(
      /b\.slug\s*=\s*'([^']+)'\s+AND\s+m\.slug\s*=\s*'([^']+)'/i,
    );
    if (!where) continue;
    const brand = where[1];
    const model = where[2];
    const key = `${brand}/${model}`;
    const row = map.get(key) ?? {
      brand_slug: brand,
      model_slug: model,
    };
    const keel = block.match(/keel_type\s*=\s*'([^']+)'/i);
    if (keel) row.keel_type = keel[1];
    const rig = block.match(/rig_type\s*=\s*'([^']+)'/i);
    if (rig) row.rig_type = rig[1];
    map.set(key, row);
  }
  return map;
}

function coeffOrCompute(bench, key, computed) {
  const fromBench = bench[key];
  if (fromBench != null && Number.isFinite(Number(fromBench))) {
    return Number(fromBench);
  }
  return computed;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Language-only cleanup for survey checkpoint strings (facts unchanged).
 * Collapses AI-ish "What X issues appear on Y" templates; fixes Arcana typo.
 */
function normalizeCheckpoint(raw) {
  let t = String(raw).trim();
  t = t.replace(/\bArcana\b/g, "Arcona");
  t = t.replace(/\u2014/g, "-").replace(/\u2026/g, "...").replace(/\u00b7/g, "/");

  let m = t.match(/^What (.+?) issues appear on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  m = t.match(/^What (.+?) appear on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  m = t.match(/^What (.+?) appears on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  m = t.match(/^Does the (.+) suffer from osmosis$/i);
  if (m) return `Osmosis risk on the ${m[1]}`;

  m = t.match(/^How serious are (.+) on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  m = t.match(/^Are (.+) common on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  if (/^What is the typical standing rigging lifespan$/i.test(t)) {
    return "Typical standing rigging lifespan";
  }
  if (/^What diesel engine issues are most reported$/i.test(t)) {
    return "Most reported diesel engine issues";
  }

  m = t.match(/^Where does (.+) appear on (.+)$/i);
  if (m) return `${capitalize(m[1])} on ${m[2]}`;

  m = t.match(/^How do I verify (.+) on (.+)$/i);
  if (m) return `How to verify ${m[1]} on ${m[2]}`;

  return t.replace(/\s+/g, " ").trim();
}

function buildRow(ref, benchByKey, research) {
  const key = `${ref.brand_slug}/${ref.model_slug}`;
  const b = benchByKey.get(key);
  if (!b) {
    throw new Error(`Benchmark missing allowlist row: ${key}`);
  }
  const r = research.get(key) ?? {};
  const loa = b.loa_m ?? null;
  const lwl = b.lwl_m ?? null;
  const beam = b.beam_m ?? null;
  const draft = b.draft_m ?? null;
  const disp = b.displacement_kg ?? null;
  const ballast = b.ballast_kg ?? null;
  const sa = b.sail_area_m2 ?? null;

  const checkpoints = [
    b.survey_checkpoint_1,
    b.survey_checkpoint_2,
    b.survey_checkpoint_3,
  ]
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .map(normalizeCheckpoint);
  if (checkpoints.length !== 3) {
    throw new Error(`${key}: expected 3 survey_checkpoints, got ${checkpoints.length}`);
  }

  return {
    brand_slug: ref.brand_slug,
    model_slug: ref.model_slug,
    name: b.name || ref.model_slug,
    loa_m: round(loa, 2),
    lwl_m: round(lwl, 2),
    beam_m: round(beam, 2),
    draft_m: round(draft, 2),
    displacement_kg: round(disp, 1),
    ballast_kg: round(ballast, 1),
    sail_area_m2: round(sa, 2),
    production_start_year: b.production_start_year ?? null,
    production_end_year: b.production_end_year ?? null,
    designer: b.designer ?? null,
    keel_type: r.keel_type ?? null,
    rig_type: r.rig_type ?? null,
    coefficients: {
      hull_speed_kn: round(
        coeffOrCompute(b, "theoretical_hull_speed_kn", hullSpeed(lwl)),
        3,
      ),
      capsize_screening: round(coeffOrCompute(b, "csf", csf(beam, disp)), 3),
      comfort_ratio: round(
        coeffOrCompute(b, "comfort_ratio", comfort(disp, lwl, loa, beam)),
        2,
      ),
      displacement_length_ratio: round(
        coeffOrCompute(b, "displacement_length_ratio", dlRatio(disp, lwl)),
        1,
      ),
      sail_area_displacement: round(
        coeffOrCompute(b, "sail_area_displacement_ratio", saDisp(sa, disp)),
        2,
      ),
    },
    survey_checkpoints: checkpoints,
    links: {
      canonical_model_url:
        b.canonical_model_url ||
        `${SITE}/en/yachts/models/${ref.brand_slug}/${ref.model_slug}/`,
      formulas_methodology_url: b.formulas_methodology_url || FORMULAS_URL,
      survey_service_url: b.survey_service_url || SURVEY_URL,
    },
  };
}

const allowlist = parseAllowlist(fs.readFileSync(slugsPath, "utf8"));
if (allowlist.length !== 93) {
  console.error(`Expected 93 allowlist rows, got ${allowlist.length}`);
  process.exit(1);
}

const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));
if (!Array.isArray(benchmark) || benchmark.length !== 93) {
  console.error(
    `Expected 93 benchmark rows, got ${Array.isArray(benchmark) ? benchmark.length : typeof benchmark}`,
  );
  process.exit(1);
}

/** @type {Map<string, Record<string, unknown>>} */
const benchByKey = new Map();
for (const row of benchmark) {
  benchByKey.set(`${row.brand_slug}/${row.model_slug}`, row);
}

const research = new Map();
for (const name of fs.readdirSync(sqlDir)) {
  if (!/^523[0-6].*\.sql$/.test(name)) continue;
  const parsed = parseResearchSql(
    fs.readFileSync(path.join(sqlDir, name), "utf8"),
  );
  for (const [k, v] of parsed) research.set(k, { ...research.get(k), ...v });
}

const models = allowlist.map((ref) => buildRow(ref, benchByKey, research));
const withDims = models.filter(
  (m) =>
    m.loa_m != null ||
    m.lwl_m != null ||
    m.displacement_kg != null ||
    m.draft_m != null,
).length;

const snapshot = {
  schema_version: 1,
  generated_at: new Date().toISOString().slice(0, 10),
  source: "fairhelm-sailboat-benchmark-2026+sql-5230-5236-keel-rig",
  model_count: models.length,
  models_with_research_dims: withDims,
  formulas: [
    {
      slug: "hull-speed",
      title: "Theoretical hull speed",
      url: `${SITE}/en/yachts/formulas/hull-speed/`,
    },
    {
      slug: "capsize-screening",
      title: "Capsize screening",
      url: `${SITE}/en/yachts/formulas/capsize-screening/`,
    },
    {
      slug: "comfort-ratio",
      title: "Brewer comfort ratio",
      url: `${SITE}/en/yachts/formulas/comfort-ratio/`,
    },
    {
      slug: "displacement-length",
      title: "Displacement/length ratio",
      url: `${SITE}/en/yachts/formulas/displacement-length/`,
    },
    {
      slug: "sail-area-displacement",
      title: "Sail area/displacement",
      url: `${SITE}/en/yachts/formulas/sail-area-displacement/`,
    },
  ],
  models,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(snapshot)}\n`, "utf8");
// CDN / backend mirrors: PKG-P3 sync — not written here.

const bytes = fs.statSync(outPath).size;
const keelFilled = models.filter((m) => m.keel_type != null).length;
const rigFilled = models.filter((m) => m.rig_type != null).length;
console.log(
  JSON.stringify(
    {
      ok: true,
      out: path.relative(root, outPath),
      bytes,
      kb: Math.round(bytes / 1024),
      model_count: models.length,
      models_with_research_dims: withDims,
      models_with_keel_type: keelFilled,
      models_with_rig_type: rigFilled,
      survey_checkpoints_per_model: 3,
    },
    null,
    2,
  ),
);

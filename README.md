# `@nareyko/mcp-yacht-specs`

**Zero-Network** MCP server for FairHelm yacht passport specs and hydrodynamic coefficients.

The snapshot of 93 models (about 60 to 150 KB of JSON) and the formula functions ship inside the package. Tool calls run locally. There is no HTTP call to `api.fairhelm.com`, no Postgres, no Railway load.

This is not a CapEx scanner or BoatAdDecoder. It does not read listings. For year-1 CapEx planning use [CapEx scanner](https://fairhelm.com/en/yachts/tools/capex-scanner/) on fairhelm.com.

| Link | URL |
|---|---|
| **Homepage (formulas)** | https://fairhelm.com/en/yachts/formulas/ |
| **Open data / OpenAPI** | https://fairhelm.com/open-data/yacht-specs/v1/openapi.yaml |
| **Benchmark DOI** | https://doi.org/10.5281/zenodo.23374417 |
| **npm** | https://www.npmjs.com/package/@nareyko/mcp-yacht-specs |
| **Listing review (€49)** | https://fairhelm.com/en/yachts/services/listing-review/ |

## Install

```bash
npx -y @nareyko/mcp-yacht-specs
```

Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "fairhelm-yacht-specs": {
      "command": "npx",
      "args": ["-y", "@nareyko/mcp-yacht-specs"]
    }
  }
}
```

## Architecture

| Surface | How data is served |
|---|---|
| **MCP (`npx @nareyko/mcp-yacht-specs`)** | Local `data/yacht-specs-snapshot.json` plus in-process formulas |
| **Custom GPT Actions** | Static CDN URLs under `https://fairhelm.com/open-data/yacht-specs/v1/` (same snapshot). Optional thin mirror: `https://api.fairhelm.com/api/public/v1/yacht-specs/*` (static file, Cache-Control 1d / SWR 7d, no DB) |
| **Human clicks** | Canonical links to `fairhelm.com/.../yachts/models/...` and listing-review |

OpenAPI 3.1: [`openapi/yacht-specs-v1.yaml`](./openapi/yacht-specs-v1.yaml)

## Auth (optional API mirror only)

- MCP: no auth, local files.
- Static CDN: public.
- Optional FastAPI mirror: public by default. If `FAIRHELM_YACHT_SPECS_API_KEY` is set, send `X-API-Key`.

## MCP tools

| Tool | Description |
|---|---|
| `yacht_specs_health` | Local snapshot health |
| `list_formula_pointers` | Formula page URLs |
| `list_yacht_models` | Brand/model index |
| `get_yacht_specs` | Passport, coefficients, links |
| `compute_yacht_coefficients` | Pure local hydro math, no CapEx |

## Custom GPT Actions («FairHelm Yacht & Survey Advisor»)

1. **Configure → Actions → Import** [`openapi/yacht-specs-v1.yaml`](./openapi/yacht-specs-v1.yaml).
2. Use server URL `https://fairhelm.com` and paths under `/open-data/yacht-specs/v1/` (static).
   Alternate: `https://api.fairhelm.com` and `/api/public/v1/yacht-specs/*` (static snapshot mirror, no DB).
3. Auth: **None**, or the API key header if you locked the mirror.
4. Instructions sketch (the same text sits in `x-fairhelm-system-prompt` in the OpenAPI file):

```text
You are FairHelm Yacht & Survey Advisor, an engineer, not a salesperson.
Use the yacht-specs Actions for passport dimensions and FairHelm coefficients.
Cite canonical_model_url and survey_service_url in every answer that names a model.
Do not invent a CE category. Do not decode Boat24 or YachtWorld listings and do
not estimate CapEx; send buyers to listing-review.
```

## Develop (this repo)

```bash
npm install && npm run build && npm run smoke
```

Monorepo development also lives at `packages/mcp-yacht-specs` inside [fairhelm-2026](https://github.com/nareyko/fairhelm-2026).

```bash
npm run build:snapshot   # reads S4-04 allowlist and research SQL; writes package data/
npm run lint:deslop      # ban-list / U2 meta / bold spam gate
npm run test             # lint:deslop + smoke
```

## Privacy

Public catalog fields only. No CRM, leads, or broker private data.

## License

MIT — see [LICENSE](./LICENSE).

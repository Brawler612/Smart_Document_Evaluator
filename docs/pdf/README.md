# Documentation PDFs

## Five deliverables (SRS, SDD, SPMP, STD, presentation checklist)

From the repo root:

```bash
npm run docs:pdf:deliverables
```

Creates in **this folder**:

| PDF | Source Markdown |
|-----|-----------------|
| `SRS-Smart-Document-Evaluator-v3.pdf` | `docs/SRS-Smart-Document-Evaluator-v3.md` |
| `SDD-Smart-Document-Evaluator-v3.pdf` | `docs/SDD-Smart-Document-Evaluator-v3.md` |
| `SPMP-Smart-Document-Evaluator-v3.pdf` | `docs/SPMP-Smart-Document-Evaluator-v3.md` |
| `STD-Smart-Document-Evaluator-v3.pdf` | `docs/STD-Smart-Document-Evaluator-v3.md` |
| `PRESENTATION-READINESS-AND-DELIVERABLES.pdf` | `docs/PRESENTATION-READINESS-AND-DELIVERABLES.md` |

Uses **`md-to-pdf`** (Puppeteer). First run may download Chromium; allow ~1–3 minutes for all five.

## Full bundle (all `docs/*.md` + README + DEPLOY)

```bash
npm run docs:pdf
```

Writes `Smart-Docs-Validator-Documentation-Bundle.pdf` (see `scripts/build-docs-pdf.mjs`).

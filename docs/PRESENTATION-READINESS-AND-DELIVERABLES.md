# Final presentation readiness — Smart Document Evaluator

**Project:** Smart Docs Validator (Smart Document Evaluator)  
**Course context:** IT332 / CS342 · CIT–University  
**Date:** May 14, 2026  

This checklist maps **your department’s pre-presentation requirements** to artifacts in this repository. Tick items locally when true; **adviser sign-off**, **peer evaluation**, and the **ACM research paper** are **external** to the repo—place signed PDFs / exports in your submission binder.

---

## Technical and software requirements

| # | Requirement | Evidence in this repo | Your action |
|---|-------------|------------------------|-------------|
| 1 | **Adviser reviewed software** and gave go-signal for final presentation | *(not in repo)* | Obtain signed memo / email printout |
| 2 | **Usability testing** completed; results **analyzed** (findings + recommendations) | Survey blueprint: `docs/SoftwareUsabilitySurvey-StudentRateUs.md` | Run sessions → paste **analysis appendix** (or link) next to this checklist in binder |
| 3 | **Four documents** updated (**SRS, SDD, SPMP, STD**) | Markdown: `docs/SRS-Smart-Document-Evaluator-v3.md` · `docs/SDD-Smart-Document-Evaluator-v3.md` · `docs/SPMP-Smart-Document-Evaluator-v3.md` · `docs/STD-Smart-Document-Evaluator-v3.md` · PDFs: `docs/pdf/*.pdf` (run `npm run docs:pdf:deliverables`) | Regenerate PDFs after editing Markdown |
| 4 | **Latest source** zipped from GitHub | `main` branch | `git archive` or GitHub **Download ZIP** |
| 5 | **ReadMe PDF** with: full **tech stack + versions**, **deployment** (frontend + backend), **sample accounts** | Source: root `README.md` (already has stack tables, Vercel + Supabase steps, test-account table) | Print/export `README.md` → **PDF** |
| 6 | **Database dump** (schema + data if applicable) | `npm run db:dump` → `db-dumps/*.sql` (folder gitignored) | Run dump on Supabase; attach **.sql** per instructor format |

### Quick commands (reference)

```bash
npm install
npm run typecheck
npm run build
npm run db:dump
```

---

## Research requirements

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | **Full research paper** in **ACM** format | *(author off-repo or `docs/` if you add `RESEARCH-PAPER.pdf` later)* | Add file when finalized |

---

## Peer evaluation

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | **Peer evaluation** completed | *(forms handled by course)* | Attach signed / scanned peer sheets |

---

## Single PDF of all Markdown

From the repo root:

```bash
npm run docs:pdf
```

Output: **`docs/pdf/Smart-Docs-Validator-Documentation-Bundle.pdf`** (merges `README.md`, `DEPLOY.md`, and all `docs/*.md` with page breaks). See `docs/pdf/README.md`.

---

## Document index (Markdown sources)

| Document | Path |
|----------|------|
| SRS v3.1 | `docs/SRS-Smart-Document-Evaluator-v3.md` |
| SRS baseline detail | `docs/SRS-Smart-Document-Evaluator-v2.md` |
| SDD v3 | `docs/SDD-Smart-Document-Evaluator-v3.md` |
| SPMP v3 | `docs/SPMP-Smart-Document-Evaluator-v3.md` |
| STD v3 | `docs/STD-Smart-Document-Evaluator-v3.md` |
| Usability survey spec | `docs/SoftwareUsabilitySurvey-StudentRateUs.md` |
| SQL / DB | `docs/supabase-setup-all-in-one.sql` (+ related `docs/supabase-*.sql`) |

---

## Note on Word templates

Department templates on the lab PC (`SRS TEMPLATE.doc`, `SDD TEMPLATE.docx`, `SPMP TEMPLATE.doc`, `STD TEMPLATE.doc`) should be used for **final formatting** if required: copy section text from the Markdown files above into the template styles (headings, table of contents, page numbers).

---

*End of checklist*

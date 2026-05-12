# CEBU INSTITUTE OF TECHNOLOGY — UNIVERSITY

## COLLEGE OF COMPUTER STUDIES

# Software Requirements Specification

**for**

# Smart Document Evaluator

---

## Change History

| Version | Date       | Author / Role | Description of change                          |
|---------|------------|---------------|------------------------------------------------|
| 1.0     | 2026-05-12 | Project team  | Initial SRS aligned to current system behavior |

---

## Table of Contents

1. [Introduction](#1-introduction)  
   1.1 [Purpose](#11-purpose)  
   1.2 [Scope](#12-scope)  
   1.3 [Definitions, Acronyms and Abbreviations](#13-definitions-acronyms-and-abbreviations)  
   1.4 [References](#14-references)  
2. [Overall Description](#2-overall-description)  
   2.1 [Product perspective](#21-product-perspective)  
   2.2 [User characteristics](#22-user-characteristics)  
   2.4 [Constraints](#24-constraints)  
   2.5 [Assumptions and dependencies](#25-assumptions-and-dependencies)  
3. [Specific Requirements](#3-specific-requirements)  
   3.1 [External interface requirements](#31-external-interface-requirements)  
   3.1.1 [Hardware interfaces](#311-hardware-interfaces)  
   3.1.2 [Software interfaces](#312-software-interfaces)  
   3.1.3 [Communications interfaces](#313-communications-interfaces)  
   3.2 [Functional requirements](#32-functional-requirements)  
   3.4 [Non-functional requirements](#34-non-functional-requirements)  

---

## 1. Introduction

### 1.1 Purpose

The purpose of this document is to provide a detailed description of the **Smart Document Evaluator** system: a web application that supports instructors in receiving, inspecting, and grading student document submissions, with optional **Google Gemini**–based automated rubric scoring and narrative feedback. The document serves developers, project managers, instructors, and academic stakeholders to align implementation with functional and non-functional requirements.

### 1.2 Scope

The Smart Document Evaluator is a **browser-based** application (single-page app) that integrates with **Supabase** (PostgreSQL, authentication, row-level security, and optional storage) and optionally the **Google Generative Language API** (Gemini) for AI-assisted evaluation.

**In scope — core capabilities:**

- **Identity and roles:** Student, teacher, and administrator roles; Google OAuth–style sign-in via Supabase Auth (as configured in deployment).
- **Assignments and submissions:** Students submit files against assignments or “general” uploads; metadata includes document type (e.g., SRS, SDD, SPMP, STD, Other), file name, URL or storage reference, timestamps, and status workflow.
- **Teacher workflows:** Submission roster, class list, grading workspace (`/grading`), **Grade AI** vs **Grade Teacher** lanes with **isolated publish semantics** (AI publish updates AI draft fields only; teacher publish updates official score and feedback without overwriting AI draft columns).
- **AI evaluation:** Optional Gemini-backed rubric fill-in, executive summary, verified-correct excerpts, language corrections, and structured persistence in `ai_draft_summary` / related fields when the schema supports them.
- **Student workflows:** View assignments, submit work, track tasks and redo requests, open files, and view **separate** read-only summaries for **AI score** vs **Teacher score** where data exists.
- **Operational resilience:** Local submission fallback and sync to Supabase when offline or when API is unavailable; environment-based configuration (`.env`).

**Out of scope (unless later revised):**

- Native mobile apps (only responsive web).
- Replacement for the institution’s official LMS gradebook export contract (CSV export exists as a convenience, not a certified interchange).
- Legal certification of AI outputs as sole evidence of academic integrity.

### 1.3 Definitions, Acronyms and Abbreviations

| Term | Definition |
|------|------------|
| **SRS** | Software Requirements Specification (this document). |
| **SPA** | Single-page application (React + Vite). |
| **RLS** | Row-Level Security — PostgreSQL policies restricting row access by role and ownership. |
| **Supabase** | Backend-as-a-service: Postgres, Auth, Storage, REST/RPC client. |
| **Gemini** | Google’s generative model family accessed via Generative Language API or a configured eval proxy. |
| **AI draft** | Automated snapshot: `ai_draft_score`, `ai_draft_summary` (and embedded JSON segments for structured extras). |
| **Teacher / official score** | Instructor-published numeric grade stored as `score` (and associated `feedback`). |
| **Grade AI** | Teacher modal path focused on running the AI evaluator and publishing **AI lane** updates only. |
| **Grade Teacher** | Teacher modal path focused on manual grade and feedback and publishing **teacher lane** updates only. |
| **RAG** (if referenced in samples) | Retrieval-Augmented Generation — not a product module name; may appear in student document types in examples. |
| **Doc type** | Label such as SRS, SDD, SPMP, STD, Other used for AI prompt context and UI display. |
| **JWT** | JSON Web Token — typical Supabase session bearer for API calls. |

### 1.4 References

| # | Title | Organization / source | Notes |
|---|--------|------------------------|--------|
| R1 | Project repository — Smart Document Evaluator | GitHub (e.g., `Brawler612/Smart-Document-Evaluator`) | Source code, issues, CI. |
| R2 | `README.md` | Project root | Local setup, scripts overview. |
| R3 | `docs/supabase-setup-all-in-one.sql` | Project `docs/` | Schema and bootstrap guidance. |
| R4 | `docs/supabase-assignments-submissions-core.sql` | Project `docs/` | Core assignments/submissions tables. |
| R5 | `docs/supabase-rls-users.sql` and related RLS fix SQL | Project `docs/` | Security policies. |
| R6 | `.env.example` | Project root | Required environment variables. |
| R7 | Google AI — Gemini API documentation | Google (`https://ai.google.dev`) | Models, quotas, billing. |
| R8 | Supabase documentation | Supabase (`https://supabase.com/docs`) | Auth, Postgres, Storage, JS client. |

---

## 2. Overall Description

### 2.1 Product perspective

The Smart Document Evaluator is a **client-server** system:

- **Client:** React 18 + TypeScript + Vite + Tailwind CSS; routing via React Router; UI for students and teachers.
- **Server-side data:** Supabase PostgreSQL holds users, assignments, submissions, and grades; optional Supabase Storage for file objects.
- **External AI:** Optional calls to Google Generative Language API (or `VITE_GEMINI_EVAL_URL` proxy) to produce structured JSON evaluation payloads merged with a fixed rubric template per assignment type.

The product does not mandate a separate application server for grading logic beyond Supabase and the browser; optional proxy URL shifts API key custody to a backend controlled by the deployer.

### 2.2 User characteristics

- **Students:** Submit documents, view status (submitted, under review, reviewed, resubmit), open attachments when URLs allow, read teacher feedback, and open **View AI score** / **View Teacher score** dialogs when the corresponding data exists.
- **Teachers / instructors:** Browse rosters and grading queue, open submissions, run AI evaluation (when configured), apply manual grades, request resubmission, delete rows where permitted, publish **lane-specific** updates, and export reviewed grades to CSV from the grading context.
- **Administrators:** Same as teachers where role checks allow; additionally may manage user roles in `public.users` and policies per project SQL docs.

### 2.4 Constraints

- **Regulatory / institutional:** FERPA-style treatment of student data is the deployer’s responsibility; the app must be hosted with HTTPS and secure Supabase keys.
- **Browser and hardware:** Requires a modern evergreen browser; sufficient RAM for large `.docx` text extraction client-side when used.
- **API and quotas:** Gemini availability, rate limits, billing, and model deprecation are **external** constraints; the app degrades to heuristic rubric drafts when keys or JSON responses are unavailable.
- **Schema:** AI draft columns must exist in the database for full AI persistence; otherwise AI-only publish may be blocked with a user-visible message per implementation.
- **RLS:** Teacher visibility of all submissions depends on correct `public.users.role` and matching SQL policies; misconfiguration appears as empty queues or permission errors.
- **Parallel use:** Multiple teachers grading the same row concurrently may cause last-write-wins on updates unless additional locking is introduced (not required in v1.0 SRS).
- **Security:** Browser-exposed `VITE_GEMINI_API_KEY` is acceptable only for development; production should prefer server-side proxy or Supabase Edge Functions pattern.

### 2.5 Assumptions and dependencies

- Supabase project is provisioned with URL and anon key; Auth provider is configured.
- Teachers who need cross-student visibility have `role` set to `teacher` or `admin` in `public.users` and matching RLS policies applied.
- Optional: Google Cloud / AI Studio project with billing and Generative Language API enabled for Gemini keys used by the app or proxy.
- Students have valid accounts and assignment linkage (or “general submission” behavior as implemented).
- Network connectivity for sync; intermittent offline behavior uses local fallback storage as implemented in the codebase.

---

## 3. Specific Requirements

### 3.1 External interface requirements

#### 3.1.1 Hardware interfaces

- No dedicated hardware interfaces beyond **standard client devices** (PC, laptop, tablet) with keyboard/pointer/touch and optional PDF/DOCX viewers via the browser.
- Optional **printer** for hardcopy of reports (browser print); not a custom driver interface.

#### 3.1.2 Software interfaces

- **Operating system:** Any OS capable of running a supported browser (Windows, macOS, Linux, etc.).
- **Supabase JS client** (`@supabase/supabase-js`) for Auth, database reads/writes, and storage URLs when used.
- **Google Generative Language API** (optional): HTTP JSON from browser or via `VITE_GEMINI_EVAL_URL` POST proxy.
- **Document parsing:** Client-side text extraction for `.docx` (e.g., mammoth) where integrated for AI inspection text.

#### 3.1.3 Communications interfaces

- **HTTPS** to Supabase REST and Auth endpoints.
- **HTTPS** to `generativelanguage.googleapis.com` when using direct Gemini from the browser (subject to CORS and key restrictions).
- **HTTPS/WSS** as required by Supabase Realtime if enabled in future revisions (not assumed mandatory in v1.0).

---

### 3.2 Functional requirements

> **Note:** The course template lists *Use Case Diagram*, *Use Case Description*, *Activity Diagram*, and *Wireframe* per transaction. Those **diagrams and wireframes** are referenced here as **deliverables to be produced** (e.g., in draw.io, Figma, or appendix PDF). This SRS specifies **requirements text**; attach diagrams under `docs/diagrams/` or a design repository when available.

---

#### Module 1 — Authentication, roles, and user profile

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M1.1 | **Sign-in and session** | The system shall authenticate users via Supabase Auth (configuration-dependent). Sessions shall authorize subsequent data access per RLS. **Deliverables:** Use case “Sign in”; activity diagram for token refresh; wireframe of login shell. |
| M1.2 | **Role-based access** | The system shall distinguish **student**, **teacher**, and **admin** (or equivalent) and route UI and queries accordingly. **Deliverables:** Use case “Access denied / redirect”; diagram of role vs route matrix. |

---

#### Module 2 — Assignments and student submission

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M2.1 | **View assignments** | Students shall view a list of assignments (including due metadata where present) and open submission flows. **Deliverables:** Use case “View assignments”; wireframe list + detail. |
| M2.2 | **Submit document** | Students shall upload or attach a file per assignment rules, select document type when applicable, and persist a submission row (Supabase or local fallback then sync). **Deliverables:** Activity “Submit file”; wireframe upload form. |
| M2.3 | **Tasks and redo** | Students shall see tasks derived from submission state, including resubmit requests and standalone redo items when implemented. **Deliverables:** Use case “Respond to redo”; activity diagram. |

---

#### Module 3 — Teacher roster and submission management

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M3.1 | **Submission roster** | Teachers shall search/filter submissions by status and text fields; desktop table and mobile cards shall list learner, file, dates, and status. **Deliverables:** Wireframe roster; use case “Filter submissions”. |
| M3.2 | **View AI / View Teacher score (read-only)** | From roster/queue where enabled, teachers shall open modals that show **only** AI lane content or **only** teacher lane content respectively, without editing. **Deliverables:** Wireframe modal variants. |
| M3.3 | **Request resubmission / delete** | Teachers shall request resubmission (with feedback) and delete submissions where policy allows. **Deliverables:** Use case “Request redo”; confirmation flow activity diagram. |

---

#### Module 4 — Grading workspace and publish semantics

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M4.1 | **Open grading from queue** | Teachers shall open the grading modal from **Grade AI** or **Grade Teacher** intents; the UI shall emphasize the corresponding lane (AI vs teacher sections). **Deliverables:** Wireframe modal header and sections. |
| M4.2 | **Run AI evaluator** | When API or proxy is configured, the system shall send submission text and rubric template to Gemini (or proxy), parse JSON, merge rubric scores, and populate AI narrative and structured fields. Without API, a documented heuristic draft may apply. **Deliverables:** Activity “Run AI”; sequence diagram client → Gemini → client. |
| M4.3 | **Grade as teacher** | Teachers shall enter a 0–100 grade (and optional per-criterion rubric where UI provides it), apply it, and attach textual feedback. **Deliverables:** Use case “Apply teacher grade”. |
| M4.4 | **Publish — AI lane** | On publish from **Grade AI**, the system shall persist **only** AI draft fields (`ai_draft_score`, `ai_draft_summary` as applicable) and general fields such as `status` and `feedback` per implementation, and shall **not** overwrite the official `score` column. **Deliverables:** Activity “Publish AI draft”. |
| M4.5 | **Publish — Teacher lane** | On publish from **Grade Teacher**, the system shall persist **only** official `score` and `feedback` (and status) and shall **not** overwrite `ai_draft_score` / `ai_draft_summary`. **Deliverables:** Activity “Publish teacher grade”. |
| M4.6 | **Resubmit clears grades** | Resubmit workflow shall clear published and draft grade fields as defined in `saveReview` / resubmit handlers. **Deliverables:** State diagram submission status. |

---

#### Module 5 — Student visibility of grades

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M5.1 | **View AI score (student)** | Students shall open a dialog showing automated AI summary and score **without** presenting it as the official teacher grade when separated by UI. **Deliverables:** Wireframe student AI dialog. |
| M5.2 | **View Teacher score (student)** | Students shall open a dialog showing official teacher score and instructor feedback narrative. **Deliverables:** Wireframe student teacher dialog. |

---

#### Module 6 — Reporting and export

| ID | Transaction / requirement | Specification |
|----|-----------------------------|----------------|
| M6.1 | **Export reviewed CSV** | Teachers shall export reviewed submissions to CSV from the grading workspace context with columns documented in implementation (e.g., name, email, file, score, status, submitted at). **Deliverables:** Sample CSV in appendix. |

---

### 3.4 Non-functional requirements

#### Performance

- Initial load and navigation shall remain responsive on typical broadband; AI evaluation latency is dominated by Gemini and document size (target: show progress/spinner and avoid duplicate submits).
- Client-side `.docx` extraction shall cap or truncate very large documents for AI prompt limits as implemented in `geminiDocumentEvaluation` (configurable constant).

#### Security

- All remote calls shall use TLS; Supabase keys in `VITE_*` are public in the bundle — production deployments shall minimize secret exposure (proxy for Gemini recommended).
- RLS policies shall enforce that students access only their rows and teachers access permitted rows.
- No storage of Google Gemini API keys in client-side source control; use `.env` excluded from git.

#### Reliability

- On transient Gemini errors, the system shall retry or show a clear message per `formatGeminiTeacherNotice` behavior.
- Local fallback submissions shall sync to Supabase when connectivity and permissions allow.

---

## Appendix A — Traceability (template placeholders)

For each **Module / Transaction** above, attach when available:

- **Use Case Diagram** — actor: Student | Teacher | Admin | External (Gemini, Supabase).
- **Use Case Description** — preconditions, postconditions, main/alternate flows.
- **Activity Diagram** — swimlanes: Client, Supabase, Gemini.
- **Wireframe** — link to Figma or exported PNG under `docs/wireframes/`.

---

*End of SRS document v1.0*

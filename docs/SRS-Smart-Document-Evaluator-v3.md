# CEBU INSTITUTE OF TECHNOLOGY – UNIVERSITY

## COLLEGE OF COMPUTER STUDIES

# Software Requirements Specification (SRS)

**for**

# Smart Document Evaluator (Smart Docs Validator) with AI Integration

**Prepared by:** Alexandrei Nash Dinapo · Jeffer Azcona · Jushua Peter Te · Ryan Bebiro  

**Document version:** 3.1 (deliverable revision)  
**Date:** May 14, 2026  

**Note on templates:** The department Word templates (`SRS TEMPLATE.doc`, etc.) could not be imported as text (binary `.doc` / `.docx`). This Markdown file follows the **same conventional SRS outline** (IEEE 830–style sections) and is the **authoritative v3.1 requirements baseline** for the repository as deployed.

---

## Change History

| Version | Date | Description |
|--------|------|-------------|
| 1.0–2.x | 2025–2026 | Prior iterations; see `docs/SRS-Smart-Document-Evaluator-v2.md`. |
| 3.0 | May 13, 2026 | Baseline aligned with Vite + React + Supabase + Vercel + Gemini (see v2 file header). |
| **3.1** | **May 14, 2026** | **Amendments:** Teacher **Course Tasks** (published assignments, optional handouts, due dates, delete/bulk-delete); student **Tasks** / **Submit Work** deep links (`openTask`); **deadline reminders** (in-app + optional browser notifications); **General Submission** bucket hidden from student task/workspace lists (still used for quick submit); **STD** document type on course tasks; nav label updates. Supersedes contradictory “teachers do not create assignments” wording from v3.0 where it conflicts with this revision. |

---

## Table of Contents

1. [Introduction](#1-introduction)  
2. [Overall description](#2-overall-description)  
3. [Specific requirements](#3-specific-requirements)  
4. [Requirements traceability](#4-requirements-traceability)  
5. [References](#5-references)  

---

## 1. Introduction

### 1.1 Purpose

This SRS specifies functional and non-functional requirements for **Smart Document Evaluator** (UI brand: **Smart Docs Validator**), a web application for **IT332 / CS342** at CIT–University. Students submit coursework; teachers review AI-assisted evaluations and publish grades; optional **Google Gemini** provides rubric-aligned feedback.

**Audience:** developers, advisers, QA, deployers, and academic reviewers.

### 1.2 Scope

**In scope**

- Google OAuth (Supabase Auth) with **class-list access gate** and role mapping (`student`, `teacher`, `admin`).
- Student **Submit Work**, **Submission Status**, **Tasks**, **Boards**, **Calendar**, **Drive**, **Sheets**, **Analytics**, **Team 14**, **Settings**; onboarding tour (**Eva**); optional **Rate us** (Google Forms).
- Teacher **Dashboard**, **Grades** (review queue), **Student Submissions**, **Documents**, **Analytics**, **Class List**, **Instructions/Inbox**, **Settings**, **Team 14**, **Reports**.
- **Course Tasks:** teachers create published tasks (title, instructions, document type **SRS | SDD | SPMP | STD | Other**), optional **due date/time**, optional **handout** file (Supabase Storage); students see active tasks on **Tasks** and may open **Submit Work** with a task pre-selected.
- **AI evaluation** (Gemini or heuristic fallback), **two-lane** AI vs teacher grading, **redo** workflow, **CSV** export, **invitation email** pipeline (Resend + CLI fallbacks).
- Deployment on **Vercel** + data on **Supabase** (Postgres + Storage + RLS).

**Out of scope**

- Official LMS replacement; native mobile app stores; legal certification of AI output as sole evidence of integrity.

### 1.3 Definitions, acronyms, and abbreviations

| Term | Definition |
|------|------------|
| **SPA** | Single-page application (React + Vite + TypeScript). |
| **RLS** | Row-Level Security on Postgres. |
| **Course task** | Teacher-authored `assignments` row shown to students (vs. system “General Submission” bucket). |
| **General Submission** | Auto-provisioned assignment for quick uploads without selecting a named task; **hidden** from student Tasks/workspace lists but still used server-side. |
| **Gemini proxy** | Same-origin `POST /api/gemini-evaluate` using server `GEMINI_API_KEY`. |

### 1.4 References

- IEEE Std 830-1998 — SRS recommended practice.  
- `docs/SDD-Smart-Document-Evaluator-v3.md` — design description.  
- `docs/SRS-Smart-Document-Evaluator-v2.md` — detailed FR baseline (see §3.1).  
- `README.md`, `docs/supabase-setup-all-in-one.sql`, Google Gemini / Supabase / Vercel / Resend documentation.  
- Republic Act No. 10173 — Data Privacy Act of 2012 (Philippines).  

### 1.5 Overview

Section 2 describes users, constraints, and dependencies. Section 3 states **baseline** requirements (v2) and **v3.1 amendments**. Section 4 maps amendments to design/tests.

---

## 2. Overall description

### 2.1 Product perspective

Standalone HTTPS web app: browser → Vercel (SPA + `api/*`) → Supabase (Auth, Postgres, Storage) → optional Google Gemini and Resend. See architecture diagram in `README.md` and `docs/SDD-Smart-Document-Evaluator-v3.md`.

### 2.2 User characteristics

- **Student** — submits files, tracks status, uses Tasks/Boards; may receive deadline reminders.  
- **Teacher** — manages class list, runs AI grading, publishes scores, manages **Course Tasks** (create/close/delete).  
- **Admin** — env-driven elevated access; same tooling as teacher where applicable.  

### 2.3 Constraints

- Google sign-in only; roster allow-list for students; `VITE_TEACHER_EMAILS` / `VITE_ADMIN_EMAILS` for staff.  
- File size and type limits per `README.md` (e.g. ≤ 25 MB).  
- Production Gemini key must not ship in client bundle (use `/api/gemini-evaluate`).  

### 2.4 Assumptions and dependencies

- Stable internet; valid Supabase, Vercel, and (optional) Resend/Gemini credentials.  
- Students use Google accounts listed in the class-list source used by the app gate.

---

## 3. Specific requirements

### 3.1 Baseline functional requirements (SRS v2)

The **numbered functional requirements FR-01 …** and interface requirements **SI-1 …** in:

**`docs/SRS-Smart-Document-Evaluator-v2.md`**

remain valid **except** where they explicitly state that teachers **do not** create or manage assignments. That sentence is **superseded** by §3.2 below for **Course Tasks** only. All other FR in v2 continue to apply (authentication, submissions, AI lane, teacher lane, invitation email, analytics, etc.).

### 3.2 Amendments and new requirements (v3.1)

| ID | Requirement |
|----|----------------|
| **AM-01** | The system **shall** allow a teacher to **create a course task** with: required title; optional description; document type in `{ SRS, SDD, SPMP, STD, Other }`; optional due date/time; optional handout file. |
| **AM-02** | On successful create, the system **shall** persist the task in `assignments` (or `assignment` if singular table) with `teacher_id` = current user and `status = active` by default. |
| **AM-03** | If a handout file is provided, the system **shall** upload it to the configured Storage bucket under a teacher-scoped path and **shall** persist `handout_url` and `handout_file_name` when those columns exist (otherwise show a documented SQL migration path). |
| **AM-04** | The system **shall** allow the teacher to **close** or **re-open** a course task (`status` closed/active). |
| **AM-05** | The system **shall** allow the teacher to **delete** a single course task and to **delete selected** tasks (bulk), with confirmation, scoped to rows owned by that teacher. |
| **AM-06** | Students **shall** see all **active** course tasks assigned to the cohort in **Tasks** (grouped by due-date urgency) and in the shared student workspace data feed, **excluding** rows whose title matches the configured **General Submission** bucket title (quick-submit bucket remains available via **Submit Work** flows). |
| **AM-07** | From **Tasks**, the system **shall** provide a path to **Submit Work** with query `openTask=<assignmentId>` so the turn-in modal opens for that task. |
| **AM-08** | The system **shall** surface **in-app deadline reminders** for active tasks with due dates within a defined near window (e.g. 72 hours) or overdue, with dismiss persistence in `sessionStorage` where implemented. |
| **AM-09** | When the browser grants permission, the system **may** emit **browser notifications** for imminent deadlines subject to per-assignment daily deduplication. |
| **AM-10** | Database check constraint on `assignments.document_type` **shall** include **STD** alongside SRS, SDD, SPMP, Other (migration script provided in repo for existing databases). |
| **AM-11** | The **Submit Work** UI **shall** allow clearing a selected handout file before publish and **shall** provide a due-date picker with explicit **OK** confirmation when implemented as a custom control. |

### 3.3 Non-functional requirements (additions)

| ID | Requirement |
|----|----------------|
| **NFR-AM-01** | Course task delete operations **shall** respect RLS (`assignments_delete_own` or equivalent). |
| **NFR-AM-02** | Hiding the General Submission row from student workspace views **shall not** break quick submit or submission rows referencing that assignment id. |
| **NFR-AM-03** | Analytics completion metrics **shall** remain consistent when workspace-visible assignments are a subset of all assignment ids (exclude hidden bucket from denominators where applicable). |

---

## 4. Requirements traceability

| Amendment | SDD section | STD section |
|-----------|-------------|-------------|
| AM-01–05 | §3.8 Course Tasks (Teacher) | TC-CT-01 … TC-CT-08 |
| AM-06–09 | §3.2 Student Submission; reminders component | TC-ST-01 … TC-ST-06 |
| AM-10 | §4 Data Design; SQL docs | TC-DB-01 |
| AM-11 | Teacher modal UI | TC-UI-01 |

---

## 5. References

- `docs/STD-Smart-Document-Evaluator-v3.md`  
- `docs/SPMP-Smart-Document-Evaluator-v3.md`  
- `docs/SDD-Smart-Document-Evaluator-v3.md`  
- `docs/PRESENTATION-READINESS-AND-DELIVERABLES.md`  

---

*End of SRS v3.1*

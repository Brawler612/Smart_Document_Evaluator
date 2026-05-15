# CEBU INSTITUTE OF TECHNOLOGY – UNIVERSITY

## COLLEGE OF COMPUTER STUDIES

# Software Test Document (STD)

**for**

# Smart Document Evaluator (Smart Docs Validator)

**Prepared by:** Alexandrei Nash Dinapo · Jeffer Azcona · Jushua Peter Te · Ryan Bebiro  

**Document version:** 3.0  
**Date:** May 14, 2026  

**Note on templates:** Follows a conventional **STD** layout (test plan, environment, cases, traceability). Source Word template `STD TEMPLATE.doc` was not machine-readable; cases below are **manual** and map to **SRS v3.1** (`docs/SRS-Smart-Document-Evaluator-v3.md`) and baseline **SRS v2** FRs.

---

## Change History

| Version | Date | Description |
|--------|------|-------------|
| 1.0 | May 14, 2026 | Initial STD for deliverable package. |

---

## Table of Contents

1. [Introduction](#1-introduction)  
2. [Test plan](#2-test-plan)  
3. [Test environment](#3-test-environment)  
4. [Feature test cases](#4-feature-test-cases)  
5. [Non-functional tests](#5-non-functional-tests)  
6. [Usability testing](#6-usability-testing)  
7. [Traceability matrix](#7-traceability-matrix)  
8. [Test summary template](#8-test-summary-template)  
9. [References](#9-references)  

---

## 1. Introduction

### 1.1 Purpose

Define verification approach for Smart Docs Validator: authentication, submissions, AI grading, teacher publishing, course tasks, reminders, email, and deployment configuration.

### 1.2 Scope

**In scope:** black-box and gray-box **manual** tests executable by a student tester with teacher and student Google accounts. **Out of scope:** automated E2E CI (not required by this document); load testing beyond informal multi-user check.

### 1.3 Definitions

| Term | Meaning |
|------|---------|
| **SUT** | System under test — deployed Vercel URL or `localhost:5173`. |
| **Pass** | Expected result observed with no blocking defect. |

---

## 2. Test plan

### 2.1 Objectives

- Confirm FR coverage for critical paths (auth, submit, grade, course tasks).  
- Record evidence (screenshots, dates, tester initials) for presentation binder.  

### 2.2 Entry criteria

- Build succeeds (`npm run build`).  
- Supabase schema applied; test accounts configured per `README.md`.  

### 2.3 Exit criteria

- All **Priority P1** cases in §4 pass on staging or production.  
- Known P2 issues listed with workaround.  

### 2.4 Responsibilities

| Activity | Owner |
|----------|--------|
| Execute tests | QA / any team member |
| Sign-off | Team lead + adviser (external record) |

---

## 3. Test environment

| Item | Specification |
|------|----------------|
| Browser | Chrome (current), Edge, or Safari |
| OS | Windows 11 / macOS |
| URLs | Production `https://www.smartformevaluator.com` and/or Vercel preview |
| Accounts | At least one **student** on class list; one **teacher** in `VITE_TEACHER_EMAILS`; optional **admin** |
| Tools | DevTools Network tab; Supabase dashboard (read-only) |

---

## 4. Feature test cases

**Columns:** ID · Objective · Preconditions · Steps · Expected  

### 4.1 Authentication and access gate

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-AUTH-01 | Student allow-list | Gmail on roster | Sign in with roster student | Lands on student Dashboard |
| TC-AUTH-02 | Block non-roster | Gmail not on roster | Sign in | Access denied message; signed out |
| TC-AUTH-03 | Teacher role | Email in `VITE_TEACHER_EMAILS` | Sign in | Teacher routes visible (e.g. Grades, Class List) |

### 4.2 Submission and storage

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-SUB-01 | Quick submit | Student session | Submit Work → quick upload valid PDF | Row appears in Submission Status |
| TC-SUB-02 | Turn in for task | Active course task | Tasks → Turn in → upload | Submission linked; `openTask` cleared from URL |
| TC-SUB-03 | File limit | Large file | Attempt upload > limit | Friendly validation (per app behavior) |

### 4.3 AI evaluation and teacher publish

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-AI-01 | Run AI evaluator | Teacher; submission pending | Open grading modal → run AI | AI draft fields populated or heuristic notice |
| TC-AI-02 | Publish teacher lane | AI exists | Edit score/feedback → publish teacher | Student sees teacher score |

### 4.4 Course tasks (teacher)

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-CT-01 | Create task | Teacher | Course Tasks → New → title + OK due date → publish | Task listed |
| TC-CT-02 | Handout optional | Teacher | Attach file → publish; repeat without file | Storage URL when columns exist |
| TC-CT-03 | Close / re-open | Task exists | Close then Re-open | Status badges update |
| TC-CT-04 | Delete one | Task exists | Delete → confirm | Row removed |
| TC-CT-05 | Bulk delete | Multiple tasks | Select two → Delete selected → confirm | Both removed |
| TC-CT-06 | STD type | Teacher | Create with document type STD | Saves without DB check error (after migration) |

### 4.5 Student workspace and reminders

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-ST-01 | General hidden | General bucket exists | Open Tasks | No "General Submission" row |
| TC-ST-02 | Deadline UI | Task due soon | Open Dashboard/Tasks | Reminder banner if within window |
| TC-ST-03 | Handout link | Task with handout | Student Tasks / Submit Work | Download link works |

### 4.6 Invitation email

| ID | Objective | Preconditions | Steps | Expected |
|----|-----------|---------------|-------|----------|
| TC-EM-01 | First sign-in mail | Resend configured | New student first login | Single branded email (check inbox) |

---

## 5. Non-functional tests

| ID | Objective | Method | Expected |
|----|-----------|--------|----------|
| TC-NF-01 | HTTPS only | Observe URL bar | No mixed-content warnings for main flows |
| TC-NF-02 | No Gemini key in bundle | View page source / network | Production calls `/api/gemini-evaluate`, not raw key in JS |
| TC-NF-03 | RLS isolation | Two student accounts | Student A cannot read B’s rows in Supabase via app |

---

## 6. Usability testing

### 6.1 Instrument

- **Survey:** `docs/SoftwareUsabilitySurvey-StudentRateUs.md` (Google Form).  
- **SUS / Likert:** as embedded in form sections.  

### 6.2 Procedure

1. Recruit ≥5 representative students (course policy).  
2. Ask participants to complete **Submit Work**, **Tasks**, and **Submission Status** tasks while thinking aloud.  
3. Post-session: submit Google Form.  

### 6.3 Analysis (fill in after sessions)

| Finding ID | Severity | Description | Recommendation | Owner |
|------------|----------|-------------|----------------|-------|
| U-01 | *(tbd)* | | | |

---

## 7. Traceability matrix

| Test ID | SRS reference |
|---------|----------------|
| TC-AUTH-01..03 | FR-01..04 (v2) |
| TC-SUB-01..03 | FR-09..11 (v2) |
| TC-AI-01..02 | FR-12..18 (v2) |
| TC-CT-01..06 | AM-01..05, AM-10 (v3.1) |
| TC-ST-01..03 | AM-06..09, AM-11 (v3.1) |
| TC-EM-01 | FR-05..07 (v2) |

---

## 8. Test summary template

**Build / commit:** `git rev-parse HEAD`  
**Environment:** production / preview / local  
**Tester:**  
**Date:**  

| Area | Total | Pass | Fail | Blocked |
|------|-------|------|------|---------|
| Auth | | | | |
| Submissions | | | | |
| AI / Grading | | | | |
| Course tasks | | | | |
| Student UI | | | | |
| Email | | | | |

**Open defects:** *(link to issue list or appendix)*  

---

## 9. References

- `docs/SRS-Smart-Document-Evaluator-v3.md`  
- `docs/SRS-Smart-Document-Evaluator-v2.md`  
- `docs/SDD-Smart-Document-Evaluator-v3.md`  
- `docs/SPMP-Smart-Document-Evaluator-v3.md`  
- `README.md`  

---

*End of STD v3.0*

# Entity-Relationship Diagram (ERD) — Smart Document Evaluator

**System:** Smart Docs Validator (Supabase Postgres `public` schema + Supabase Auth)  
**Sources of truth:** `docs/supabase-setup-all-in-one.sql`, `docs/supabase-assignments-submissions-core.sql`, `docs/supabase-assignments-handout.sql`, `docs/supabase-add-users-avatar-url.sql`, `docs/supabase-submissions-submission-doc-type.sql`  
**Date:** May 14, 2026  

This document describes the **logical ERD** implemented in production. Storage objects (files in the `student-submissions` bucket) are **not** rows in Postgres; they are referenced by URL in `submissions.file_url` and optionally in `assignments.handout_url`.

---

## 1. Entity overview

| Entity | Schema | Purpose |
|--------|--------|---------|
| **auth.users** | `auth` | Supabase-managed identity (OAuth). Not in `public`; shown for referential integrity. |
| **users** | `public` | Application profile mirrored from Auth (`id` = `auth.users.id`). Role, display name, optional avatar. |
| **assignments** | `public` | Course tasks / buckets (teacher-owned rows + system “General Submission” style rows). |
| **submissions** | `public` | Student upload rows: file metadata, status, scores, AI draft fields. |

**Out of scope for this ERD (no dedicated tables in repo SQL):** Vercel serverless logs, Resend message IDs, Gemini call logs, Google Forms responses.

---

## 2. Attributes (as implemented)

### 2.1 `auth.users` (Supabase Auth — reference only)

| Attribute | Notes |
|-----------|--------|
| `id` | UUID primary key; same value as `public.users.id`. |
| `email`, `raw_user_meta_data`, … | Managed by Supabase; not duplicated here. |

### 2.2 `public.users`

| Column | Type | Constraints / notes |
|--------|------|----------------------|
| `id` | uuid | **PK**, **FK → `auth.users(id)`** `ON DELETE CASCADE`. |
| `email` | text | `NOT NULL`, `UNIQUE`. |
| `full_name` | text | `NOT NULL`. |
| `role` | text | `NOT NULL`, default `'student'`; check: `teacher`, `student`, `admin`. |
| `created_at` | timestamptz | `NOT NULL`, default `now()`. |
| `avatar_url` | text | **Optional** (`docs/supabase-add-users-avatar-url.sql`). OAuth picture URL. |

### 2.3 `public.assignments`

| Column | Type | Constraints / notes |
|--------|------|----------------------|
| `id` | uuid | **PK**, default `gen_random_uuid()`. |
| `title` | text | `NOT NULL`. |
| `description` | text | `NOT NULL`, default `''`. |
| `document_type` | text | `NOT NULL`, default `'Other'`; check: `SRS`, `SDD`, `SPMP`, `STD`, `Other`. |
| `teacher_id` | uuid | **FK → `public.users(id)`** `NOT NULL`, `ON DELETE CASCADE`. |
| `group_id` | uuid | Nullable; **no FK** in bundled SQL (reserved for future / manual integrity). |
| `due_date` | timestamptz | Nullable. |
| `max_score` | integer | `NOT NULL`, default `100`. |
| `status` | text | `NOT NULL`, default `'active'`; check: `active`, `closed`, `draft`. |
| `created_at` | timestamptz | `NOT NULL`, default `now()`. |
| `updated_at` | timestamptz | `NOT NULL`, default `now()`. |
| `handout_url` | text | **Optional** (`docs/supabase-assignments-handout.sql`). |
| `handout_file_name` | text | **Optional** (same migration). |

### 2.4 `public.submissions`

| Column | Type | Constraints / notes |
|--------|------|----------------------|
| `id` | uuid | **PK**, default `gen_random_uuid()`. |
| `assignment_id` | uuid | **FK → `public.assignments(id)`** nullable, **`ON DELETE SET NULL`**. |
| `student_id` | uuid | **FK → `public.users(id)`** `NOT NULL`, `ON DELETE CASCADE`. |
| `file_name` | text | `NOT NULL`. |
| `file_url` | text | Nullable (Storage path / public URL pattern per app). |
| `status` | text | `NOT NULL`, default `'submitted'`; check: `submitted`, `under_review`, `reviewed`, `resubmit`. |
| `feedback` | text | Nullable. |
| `score` | numeric | Nullable (teacher-published). |
| `ai_draft_score` | integer | Nullable. |
| `ai_draft_summary` | text | Nullable. |
| `submission_doc_type` | text | Nullable; check allows `SRS`, `SDD`, `SPMP`, `STD`, `Other` or null. |
| `submitted_at` | timestamptz | `NOT NULL`, default `now()`. |

---

## 3. Relationships (cardinality)

| From | To | Cardinality | FK / rule |
|------|-----|-------------|-----------|
| `auth.users` | `public.users` | **1 : 1** | `public.users.id` references `auth.users(id)`. |
| `public.users` | `public.assignments` | **1 : N** | `assignments.teacher_id` → `users.id` (teacher who created the task). |
| `public.assignments` | `public.submissions` | **1 : N** | `submissions.assignment_id` → `assignments.id` (optional: null for orphan / legacy rows). |
| `public.users` | `public.submissions` | **1 : N** | `submissions.student_id` → `users.id` (student who uploaded). |

**Delete behavior**

- Deleting **`auth.users`** (or cascade from Auth) removes **`public.users`** row → cascades to that user’s **assignments** (if they are the teacher) and **submissions** (as student).  
- Deleting an **assignment** sets **`submissions.assignment_id`** to **NULL** (submissions kept for audit / grading history).  
- Deleting **`public.users`** as **student** cascades to their **submissions**.

---

## 4. ERD diagram (Mermaid)

Paste into [Mermaid Live Editor](https://mermaid.live) or any Markdown viewer with Mermaid support (GitHub, many IDEs).

```mermaid
erDiagram
  AUTH_USERS {
    uuid id PK
  }

  USERS {
    uuid id PK_FK
    text email UK
    text full_name
    text role
    timestamptz created_at
    text avatar_url "optional"
  }

  ASSIGNMENTS {
    uuid id PK
    text title
    text description
    text document_type
    uuid teacher_id FK
    uuid group_id "nullable, no FK in SQL"
    timestamptz due_date
    int max_score
    text status
    timestamptz created_at
    timestamptz updated_at
    text handout_url "optional"
    text handout_file_name "optional"
  }

  SUBMISSIONS {
    uuid id PK
    uuid assignment_id FK "nullable"
    uuid student_id FK
    text file_name
    text file_url
    text status
    text feedback
    numeric score
    int ai_draft_score
    text ai_draft_summary
    text submission_doc_type
    timestamptz submitted_at
  }

  AUTH_USERS ||--|| USERS : "id"
  USERS ||--o{ ASSIGNMENTS : "teacher_id"
  USERS ||--o{ SUBMISSIONS : "student_id"
  ASSIGNMENTS ||--o{ SUBMISSIONS : "assignment_id"
```

---

## 5. Crow’s foot (textual) view

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ auth.users  │1     1  │ public.users │1     N  │ assignments │
│   (Auth)    │─────────│   (profile)  │─────────│   (tasks)   │
└─────────────┘         └───────┬──────┘         └──────┬──────┘
                                │                       │
                                │ 1                     │ 0..1
                                │                       │
                                │ N                     │ N
                                ▼                       ▼
                        ┌──────────────┐         ┌─────────────┐
                        │  submissions│◄────────│  (same)     │
                        │  (uploads)  │         └─────────────┘
                        └──────────────┘
```

- Each **submission** belongs to exactly **one** student (`student_id`).  
- Each **submission** references **zero or one** assignment (`assignment_id` nullable).  
- Each **assignment** belongs to exactly **one** teacher user (`teacher_id`).

---

## 6. Storage (external to ERD tables)

| Artifact | Persistence |
|----------|-------------|
| Student upload binary | Supabase Storage bucket (e.g. `student-submissions`); **`submissions.file_url`** points to object. |
| Teacher handout | Same bucket pattern when used; **`assignments.handout_url`** (+ `handout_file_name`). |

---

## 7. Singular table name variant

Some deployments resolve the table as **`assignment`** / **`submission`** (singular) per app fallback logic. The **relationships are the same**; only relation names change.

---

*End of ERD document*

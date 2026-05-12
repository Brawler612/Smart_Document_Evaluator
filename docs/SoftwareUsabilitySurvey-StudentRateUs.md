# Software Usability Feedback Survey — Smart Docs Validator (Smart Document Evaluator)

Paste each section below into a Google Form (one Form section per H2 heading). All radio /
Likert questions are **required** unless marked _(optional)_. Times in parentheses are rough
completion estimates.

> ### Fastest path — let Apps Script build it for you (≈ 30 seconds)
>
> Open `scripts/google-forms/create-rate-us-form.gs`, copy the file into
> https://script.google.com (New project → paste → Save), pick the function
> `createSmartDocsValidatorSurvey`, click **Run**, authorize when prompted. The
> finished Form (with all sections, Likert grids, regex validation, and consent
> branching) lands in your Drive. The script prints the **Public URL** and **Short
> URL** in the Execution log — drop the short URL into `.env`:
>
> ```env
> VITE_STUDENT_RATE_US_URL=https://forms.gle/XXXXXXXX
> ```
>
> ### Manual path (5 minutes, no Apps Script)
> 1. Go to https://forms.google.com → blank form.
> 2. Title it **`Smart Docs Validator — Software Usability Feedback Survey`**.
> 3. Description: paste the **Form description** below.
> 4. For each `## Section`, click the **`Add section`** divider and copy each `### Question`
>    as its own item. Use the question type listed in `Type:`.
> 5. Settings → Responses → **Collect email addresses** (verified), **Limit to 1 response**
>    (optional, if you have Workspace), and **Show summary charts** to teachers only.
> 6. Publish → copy the public link → set `VITE_STUDENT_RATE_US_URL=<link>` in `.env`
>    and rebuild. The floating "Rate us" pill in the student portal will now open it in a
>    new tab.

---

## Form description

Help us improve **Smart Docs Validator**, the AI-assisted document evaluator your
class uses for SRS / SDD / SPMP / STD and other coursework. Your feedback shapes the
AI rubric, per-page Before → After feedback, and the teacher grading flow. Estimated
time: **5–7 minutes**. Responses are reviewed only by the project team.

---

## Section 1 — Consent to Participate (≈ 30 s)

### Question 1 · Consent

- **Type:** Multiple choice (single answer) · **Required**
- **Question:** I have read and understand that this survey collects feedback on the
  Smart Docs Validator student portal, AI Evaluator, and teacher grading workflow. I
  voluntarily agree to participate and rate the system based on my real experience.
- **Options:**
  - I agree to participate.
  - I do not agree (closes the form).
- **Branching:** If `I do not agree` → end the form with a thank-you screen.

---

## Section 2 — Personal Details (≈ 30 s)

### Question 2 · Full name

- **Type:** Short answer · **Required**
- **Validation:** Text length ≥ 2.

### Question 3 · School email

- **Type:** Short answer · **Required**
- **Validation:** _Response type → Regular expression → contains_
  `^[A-Za-z0-9._%+-]+@(cit\.edu|citu\.edu\.ph|.+\..+)$`
  · Error: "Use your campus email."

### Question 4 · Role _(optional)_

- **Type:** Multiple choice (single answer)
- **Options:** Undergraduate · Graduate · Faculty · Other

### Question 5 · Course / Section _(optional)_

- **Type:** Short answer · Placeholder: `e.g. IT332 — Section A`

### Question 6 · How often do you use Smart Docs Validator?

- **Type:** Multiple choice (single answer) · **Required**
- **Options:** Daily · A few times a week · Weekly · A few times a month · First time today

---

## Section 3 — Submission Workflow Usability (≈ 1 min)

> Add this as a **Likert / multiple-choice grid**. Columns are the same for every row.

### Question 7 · Submission workflow — Likert grid

- **Type:** Multiple choice grid · **Required (one per row)**
- **Columns (left → right):** Strongly Disagree · Disagree · Neutral · Agree · Strongly Agree
- **Rows:**
  1. Logging in with Google OAuth was fast and reliable.
  2. Finding the right assignment in **Assignments** was easy.
  3. Uploading my document (.pdf / .docx / images) was straightforward.
  4. The status of my submission (Under review / Graded / Needs resubmission) was clear.
  5. I trusted that my uploaded file was stored securely.

### Question 8 · Anything confusing about the submission flow? _(optional)_

- **Type:** Paragraph

---

## Section 4 — AI Evaluator Quality (≈ 2 min)

> The headline feature — keep this section sharp.

### Question 9 · AI Evaluator — Likert grid

- **Type:** Multiple choice grid · **Required (one per row)**
- **Columns:** Strongly Disagree · Disagree · Neutral · Agree · Strongly Agree
- **Rows:**
  1. The **AI rubric scores** matched my understanding of the document quality.
  2. The **Executive summary** (Strengths / Needs improvement) was specific and useful.
  3. The **Document overview & scoring** (page-range scores out of 10) felt accurate.
  4. The **Visual & diagram evaluation** (DFD, sequence, ERD, etc.) was helpful.
  5. The **Per-page Before → After** rewrite improved my draft in a meaningful way.
  6. The AI cited concrete evidence (quotes / page numbers / image observations).
  7. Running the evaluator was fast enough for normal use.
  8. I would trust the AI suggestions before submitting a final version.

### Question 10 · Which AI sections were MOST useful? _(optional)_

- **Type:** Checkboxes (multi-select)
- **Options:**
  - Rubric scores per criterion
  - Executive summary
  - Document overview & scoring (page ranges)
  - Visual & diagram evaluation (table)
  - Per-page Before → After
  - Verified correct excerpts
  - Suggested corrections (Before → After)
  - Other (write in)

### Question 11 · One thing the AI got wrong on your document _(optional)_

- **Type:** Paragraph
- **Description:** Quote the AI claim or paste a screenshot link if you have it.

---

## Section 5 — Teacher Feedback & Score Visibility (≈ 1 min)

### Question 12 · Teacher review experience — Likert grid

- **Type:** Multiple choice grid · **Required (one per row)**
- **Columns:** Strongly Disagree · Disagree · Neutral · Agree · Strongly Agree
- **Rows:**
  1. I could clearly see when my work was **graded by AI**, **graded by the teacher**, or **both**.
  2. The teacher's written feedback was easy to find.
  3. The split between **AI score** and **Teacher score** made sense to me.
  4. Resubmission instructions (when present) were clear and actionable.

### Question 13 · Teacher feedback comments _(optional)_

- **Type:** Paragraph

---

## Section 6 — Performance, Accessibility & Errors (≈ 1 min)

### Question 14 · Performance & access — Likert grid

- **Type:** Multiple choice grid · **Required (one per row)**
- **Columns:** Strongly Disagree · Disagree · Neutral · Agree · Strongly Agree
- **Rows:**
  1. Pages load quickly on my device.
  2. The interface looks good on **mobile / small screens**.
  3. Text size and contrast were comfortable to read.
  4. I rarely (or never) hit errors or unexpected behavior.

### Question 15 · Which device do you mostly use? _(optional)_

- **Type:** Multiple choice (single answer)
- **Options:** Laptop · Desktop · Tablet · Phone · Mix

### Question 16 · Browser _(optional)_

- **Type:** Multiple choice (single answer)
- **Options:** Chrome · Edge · Firefox · Safari · Brave · Other

### Question 17 · Describe a bug or error you saw _(optional)_

- **Type:** Paragraph

---

## Section 7 — Overall Recommendation (≈ 30 s)

### Question 18 · NPS — Likelihood to recommend

- **Type:** Multiple choice (single answer) · **Required**
- **Question:** How likely are you to recommend Smart Docs Validator to a classmate?
- **Options:**
  - Very Unlikely (0–2)
  - Unlikely (3–4)
  - Neutral (5–6)
  - Likely (7–8)
  - Very Likely (9–10)

### Question 19 · Single biggest improvement _(optional)_

- **Type:** Paragraph
- **Description:** If we could fix only ONE thing in the next release, what should it be?

### Question 20 · Anything else you want to tell us? _(optional)_

- **Type:** Paragraph

---

## After-submit screen

Confirmation message:

> **Thanks — we got your feedback.**
> Your responses go directly to the Smart Docs Validator team. If you reported a bug,
> a teacher or admin may follow up using your campus email.

---

## Wiring it into the student portal

1. Publish the form (top-right **Send** → **Link** icon → copy short URL).
2. Edit your project `.env`:
   ```env
   VITE_STUDENT_RATE_US_URL=https://forms.gle/XXXXXXXX
   ```
3. Restart `npm run dev` (or rebuild for production).
4. The floating maroon **"Rate us"** pill in the bottom-right corner of every student
   page will now open this form in a new tab. Teachers and admins never see the pill —
   it is gated by `user.role !== 'teacher' && 'admin'` in `src/components/Layout.tsx`.
5. If `VITE_STUDENT_RATE_US_URL` is left empty, the pill falls back to the built-in
   in-app rating modal (`src/components/student/StudentRateUsButton.tsx`).

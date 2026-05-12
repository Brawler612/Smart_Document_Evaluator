/**
 * Smart Docs Validator — Auto-build the "Software Usability Feedback Survey"
 * in Google Forms.
 *
 * HOW TO RUN (≈ 30 seconds):
 *   1. Open https://script.google.com → New project.
 *   2. Delete the placeholder `function myFunction() {}` and paste THIS ENTIRE FILE.
 *   3. Click the disk icon to save. Name the project anything (e.g. "SDV survey builder").
 *   4. In the toolbar pick the function `createSmartDocsValidatorSurvey` from the dropdown.
 *   5. Click **Run**. Authorize when prompted (Google → Allow).
 *   6. After the run finishes, open **View → Logs** (or **Executions**) — the script
 *      logs the **Public URL** and **Editor URL** of the new Form.
 *   7. Copy the Public URL into `.env`:
 *        VITE_STUDENT_RATE_US_URL=https://forms.gle/XXXXXXXX
 *      Restart `npm run dev` (or rebuild). The floating maroon "Rate us" pill in the
 *      student portal will now open this form in a new tab.
 *
 * The form mirrors the structure in
 *   docs/SoftwareUsabilitySurvey-StudentRateUs.md
 * and is tailored to Smart Docs Validator (AI Evaluator, per-page Before → After,
 * document overview & scoring, visual & diagram evaluation, teacher score split, etc.).
 *
 * Re-running the function creates a NEW form each time — your old responses are
 * never overwritten. If you want to edit instead of recreate, open the Editor URL
 * from the logs.
 */
function createSmartDocsValidatorSurvey() {
  var form = FormApp.create(
    'Smart Docs Validator — Software Usability Feedback Survey'
  );

  form
    .setDescription(
      [
        'Help us improve Smart Docs Validator, the AI-assisted document evaluator your',
        'class uses for SRS / SDD / SPMP / STD and other coursework. Your feedback shapes',
        'the AI rubric, per-page Before → After feedback, and the teacher grading flow.',
        '',
        'Estimated time: 5–7 minutes. Responses are reviewed only by the project team.',
      ].join('\n')
    )
    .setCollectEmail(true)
    .setAllowResponseEdits(true)
    .setShowLinkToRespondAgain(false)
    .setProgressBar(true)
    .setConfirmationMessage(
      [
        'Thanks — we got your feedback.',
        '',
        'Your responses go directly to the Smart Docs Validator team. If you reported a bug,',
        'a teacher or admin may follow up using your campus email.',
      ].join('\n')
    );

  /* -------------------------------------------------------------------------
   * Reusable Likert columns (Strongly Disagree → Strongly Agree)
   * ----------------------------------------------------------------------- */
  var LIKERT_5 = [
    'Strongly Disagree',
    'Disagree',
    'Neutral',
    'Agree',
    'Strongly Agree',
  ];

  /* =========================================================================
   * SECTION 1 — Consent (this section is the form's opening; no page break before it)
   * ======================================================================= */
  var consent = form.addMultipleChoiceItem();
  /** Page-navigation API on a Choice: route "I do not agree" straight to SUBMIT so the respondent can exit cleanly. */
  var agreeChoice = consent.createChoice('I agree to participate.');
  var declineChoice = consent.createChoice(
    'I do not agree (closes the form).',
    FormApp.PageNavigationType.SUBMIT
  );

  consent
    .setTitle('Consent to Participate')
    .setHelpText(
      'I have read and understand that this survey collects feedback on the Smart Docs ' +
        'Validator student portal, AI Evaluator, and teacher grading workflow. I ' +
        'voluntarily agree to participate and rate the system based on my real experience.'
    )
    .setRequired(true)
    .setChoices([agreeChoice, declineChoice]);

  /* =========================================================================
   * SECTION 2 — Personal Details
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('Personal Details')
    .setHelpText('Tells us who you are so we can follow up if you reported a bug.');

  form
    .addTextItem()
    .setTitle('Your Full Name')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Please enter your full name (at least 2 characters).')
        .requireTextMatchesPattern('^.{2,}$')
        .build()
    );

  form
    .addTextItem()
    .setTitle('Your School Email')
    .setHelpText('Use your campus email (e.g. ...@cit.edu, ...@citu.edu.ph).')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Use a valid campus email address.')
        .requireTextMatchesPattern('^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
        .build()
    );

  form
    .addMultipleChoiceItem()
    .setTitle('Role (optional)')
    .setChoiceValues(['Undergraduate', 'Graduate', 'Faculty', 'Other']);

  form
    .addTextItem()
    .setTitle('Course / Section (optional)')
    .setHelpText('e.g. IT332 — Section A');

  form
    .addMultipleChoiceItem()
    .setTitle('How often do you use Smart Docs Validator?')
    .setRequired(true)
    .setChoiceValues([
      'Daily',
      'A few times a week',
      'Weekly',
      'A few times a month',
      'First time today',
    ]);

  /* =========================================================================
   * SECTION 3 — Submission Workflow Usability
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('Submission Workflow Usability')
    .setHelpText('How smooth is the path from logging in to submitting a file?');

  form
    .addGridItem()
    .setTitle('Rate your agreement — Submission workflow')
    .setRequired(true)
    .setRows([
      'Logging in with Google OAuth was fast and reliable.',
      'Finding the right assignment in Assignments was easy.',
      'Uploading my document (.pdf / .docx / images) was straightforward.',
      'The status of my submission (Under review / Graded / Needs resubmission) was clear.',
      'I trusted that my uploaded file was stored securely.',
    ])
    .setColumns(LIKERT_5);

  form
    .addParagraphTextItem()
    .setTitle('Anything confusing about the submission flow? (optional)');

  /* =========================================================================
   * SECTION 4 — AI Evaluator Quality (headline section)
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('AI Evaluator Quality')
    .setHelpText(
      'The rubric, executive summary, document overview & scoring, visual & diagram ' +
        'evaluation, and per-page Before → After sections in the AI evaluator.'
    );

  form
    .addGridItem()
    .setTitle('Rate your agreement — AI Evaluator')
    .setRequired(true)
    .setRows([
      'The AI rubric scores matched my understanding of the document quality.',
      'The Executive summary (Strengths / Needs improvement) was specific and useful.',
      'The Document overview & scoring (page-range scores out of 10) felt accurate.',
      'The Visual & diagram evaluation (DFD, sequence, ERD, etc.) was helpful.',
      'The Per-page Before → After rewrite improved my draft in a meaningful way.',
      'The AI cited concrete evidence (quotes / page numbers / image observations).',
      'Running the evaluator was fast enough for normal use.',
      'I would trust the AI suggestions before submitting a final version.',
    ])
    .setColumns(LIKERT_5);

  form
    .addCheckboxItem()
    .setTitle('Which AI sections were MOST useful? (optional)')
    .setChoiceValues([
      'Rubric scores per criterion',
      'Executive summary',
      'Document overview & scoring (page ranges)',
      'Visual & diagram evaluation (table)',
      'Per-page Before → After',
      'Verified correct excerpts',
      'Suggested corrections (Before → After)',
    ])
    .showOtherOption(true);

  form
    .addParagraphTextItem()
    .setTitle('One thing the AI got wrong on your document (optional)')
    .setHelpText('Quote the AI claim or paste a screenshot link if you have it.');

  /* =========================================================================
   * SECTION 5 — Teacher Feedback & Score Visibility
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('Teacher Feedback & Score Visibility')
    .setHelpText(
      'How clear was it which score came from AI vs your instructor, and how usable was ' +
        'the written feedback?'
    );

  form
    .addGridItem()
    .setTitle('Rate your agreement — Teacher review experience')
    .setRequired(true)
    .setRows([
      'I could clearly see when my work was graded by AI, by the teacher, or both.',
      "The teacher's written feedback was easy to find.",
      'The split between AI score and Teacher score made sense to me.',
      'Resubmission instructions (when present) were clear and actionable.',
    ])
    .setColumns(LIKERT_5);

  form
    .addParagraphTextItem()
    .setTitle('Comments on teacher feedback or score display (optional)');

  /* =========================================================================
   * SECTION 6 — Performance, Accessibility & Errors
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('Performance, Accessibility & Errors');

  form
    .addGridItem()
    .setTitle('Rate your agreement — Performance & access')
    .setRequired(true)
    .setRows([
      'Pages load quickly on my device.',
      'The interface looks good on mobile / small screens.',
      'Text size and contrast were comfortable to read.',
      'I rarely (or never) hit errors or unexpected behavior.',
    ])
    .setColumns(LIKERT_5);

  form
    .addMultipleChoiceItem()
    .setTitle('Which device do you mostly use? (optional)')
    .setChoiceValues(['Laptop', 'Desktop', 'Tablet', 'Phone', 'Mix']);

  form
    .addMultipleChoiceItem()
    .setTitle('Browser (optional)')
    .setChoiceValues(['Chrome', 'Edge', 'Firefox', 'Safari', 'Brave', 'Other']);

  form
    .addParagraphTextItem()
    .setTitle('Describe a bug or error you saw (optional)')
    .setHelpText(
      'What happened, what you expected, and roughly when it happened (so we can match ' +
        'it in logs).'
    );

  /* =========================================================================
   * SECTION 7 — Overall Recommendation
   * ======================================================================= */
  form
    .addPageBreakItem()
    .setTitle('Overall Recommendation');

  form
    .addMultipleChoiceItem()
    .setTitle(
      'How likely are you to recommend Smart Docs Validator to a classmate?'
    )
    .setRequired(true)
    .setChoiceValues([
      'Very Unlikely (0–2)',
      'Unlikely (3–4)',
      'Neutral (5–6)',
      'Likely (7–8)',
      'Very Likely (9–10)',
    ]);

  form
    .addParagraphTextItem()
    .setTitle('Single biggest improvement (optional)')
    .setHelpText('If we could fix only ONE thing in the next release, what should it be?');

  form
    .addParagraphTextItem()
    .setTitle('Anything else you want to tell us? (optional)');

  /* -------------------------------------------------------------------------
   * Print URLs to the execution log so you can copy them into .env right away.
   * ----------------------------------------------------------------------- */
  var publicUrl = form.getPublishedUrl();
  var shortUrl = form.shortenFormUrl(publicUrl);
  var editorUrl = form.getEditUrl();

  Logger.log('Form created.');
  Logger.log('Public URL  : ' + publicUrl);
  Logger.log('Short URL   : ' + shortUrl);
  Logger.log('Editor URL  : ' + editorUrl);
  Logger.log('');
  Logger.log(
    'Drop this into .env to wire the "Rate us" pill to your form:'
  );
  Logger.log('VITE_STUDENT_RATE_US_URL=' + shortUrl);

  return {
    publicUrl: publicUrl,
    shortUrl: shortUrl,
    editorUrl: editorUrl,
  };
}

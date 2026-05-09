/** Avoid `/grading?submission=undefined` when template literals coerce missing ids to strings. */

export function isPlausibleSubmissionId(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (s === 'undefined' || s === 'null' || s === '[object Object]') return false;
  return true;
}

/** Safe target for grading deep links. Routes to `/grading` when id is unusable. */
export function gradingLinkForSubmission(submissionId: unknown): string {
  if (submissionId == null) return '/grading';
  const s =
    typeof submissionId === 'string' ? submissionId.trim() : String(submissionId).trim();
  if (!isPlausibleSubmissionId(s)) return '/grading';
  return `/grading?submission=${encodeURIComponent(s)}`;
}

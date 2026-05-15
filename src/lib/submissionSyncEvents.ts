/** Fired when a submission row is removed (student hard-delete or teacher delete). */
export const SUBMISSION_REMOVED_EVENT = 'sde:submission-removed';

export function emitSubmissionRemoved(id: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUBMISSION_REMOVED_EVENT, { detail: { id } }));
}

export function subscribeSubmissionRemoved(handler: (id: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    if (id) handler(id);
  };
  window.addEventListener(SUBMISSION_REMOVED_EVENT, listener);
  return () => window.removeEventListener(SUBMISSION_REMOVED_EVENT, listener);
}

/** @deprecated Use SUBMISSION_REMOVED_EVENT */
export const STUDENT_SUBMISSION_REMOVED_EVENT = SUBMISSION_REMOVED_EVENT;

/** @deprecated Use emitSubmissionRemoved */
export function emitStudentSubmissionRemoved(id: string): void {
  emitSubmissionRemoved(id);
}

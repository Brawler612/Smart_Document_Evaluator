import { supabase } from './supabase';
import { isMissingColumnError } from './supabaseSchemaHints';

/** Allowed on legacy Supabase schemas before `docs/supabase-document-type-spp-only.sql` is applied. */
export const LEGACY_SUBMISSION_DOC_TYPE = 'Other';

export function isSubmissionDocTypeCheckViolation(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('submissions_submission_doc_type_check') ||
    (m.includes('check constraint') && m.includes('submission_doc_type'))
  );
}

function submissionDocTypeAttempts(preferred: string | null | undefined): (string | undefined)[] {
  const dt = preferred?.trim();
  if (!dt) return [undefined];
  const out: (string | undefined)[] = [dt];
  if (dt !== LEGACY_SUBMISSION_DOC_TYPE) out.push(LEGACY_SUBMISSION_DOC_TYPE);
  out.push(undefined);
  return out;
}

function buildInsertPayloads(
  basePayload: Record<string, unknown>,
  options?: { submissionDocType?: string | null; assignmentId?: string | null }
): Record<string, unknown>[] {
  const docAttempts = submissionDocTypeAttempts(options?.submissionDocType);
  const assignmentId = options?.assignmentId?.trim() || null;
  const seen = new Set<string>();
  const payloads: Record<string, unknown>[] = [];

  const push = (row: Record<string, unknown>) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return;
    seen.add(key);
    payloads.push(row);
  };

  for (const docType of docAttempts) {
    if (assignmentId) {
      push({
        ...basePayload,
        assignment_id: assignmentId,
        ...(docType ? { submission_doc_type: docType } : {}),
      });
    }
    push({
      ...basePayload,
      ...(docType ? { submission_doc_type: docType } : {}),
    });
  }

  return payloads;
}

/**
 * Insert a student submission, retrying when optional columns or legacy doc-type checks differ from this app (SPP).
 */
export async function insertStudentSubmissionRow(
  table: 'submissions' | 'submission',
  basePayload: Record<string, unknown>,
  options?: { submissionDocType?: string | null; assignmentId?: string | null }
): Promise<{ error: { message: string } | null }> {
  const payloads = buildInsertPayloads(basePayload, options);
  let lastMessage: string | null = null;

  for (const row of payloads) {
    const result = await supabase.from(table).insert(row as never);
    if (!result.error) return { error: null };

    const msg = result.error.message;
    lastMessage = msg;

    if (isMissingColumnError(msg, 'assignment_id') && 'assignment_id' in row) continue;
    if (isMissingColumnError(msg, 'submission_doc_type') && 'submission_doc_type' in row) continue;
    if (isSubmissionDocTypeCheckViolation(msg) && 'submission_doc_type' in row) continue;
  }

  return { error: lastMessage ? { message: lastMessage } : { message: 'Submit failed.' } };
}

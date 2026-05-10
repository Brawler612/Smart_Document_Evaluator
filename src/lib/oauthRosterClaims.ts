/** Pull optional roster hints from OAuth `user_metadata` (e.g. Google). */

function coerceStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function flattenCustomClaims(meta: Record<string, unknown>): Record<string, unknown> | null {
  const raw = meta.custom_claims;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Looks for identifiers some schools emit via SSO optional claims mapped into `user_metadata`.
 * CIT/U often uses plain `firstname.lastname@cit.edu` — student number is rarely inside the mailbox.
 */
export function rosterFieldsFromOAuthMetadata(
  meta: Record<string, unknown> | undefined
): { student_number: string | null; course_year: string | null } {
  const m = meta ?? {};
  const custom = flattenCustomClaims(m);

  let student_number: string | null =
    coerceStr(m.student_number) ??
    coerceStr(m.student_id) ??
    coerceStr(m.studentId) ??
    coerceStr((m as Record<string, unknown>).employee_id);

  if (!student_number && custom) {
    student_number =
      coerceStr(custom.student_number) ??
      coerceStr(custom.student_id) ??
      coerceStr(custom['student_number']) ??
      coerceStr(custom.employeeId);
  }

  let course_year: string | null =
    coerceStr(m.course_year) ??
    coerceStr(m.courseYear) ??
    coerceStr(m.school_year) ??
    coerceStr(m.year_level) ??
    coerceStr(m.yearLevel);

  if (!course_year && typeof m.job_title === 'string') {
    const jt = m.job_title.trim();
    if (/^BS(IT|CS|IS|M)\s*-\s*\d|^Year\s*\d|^Y\d/i.test(jt)) course_year = jt;
  }

  if (!course_year && custom) {
    course_year =
      coerceStr(custom.course_year) ??
      coerceStr(custom.courseYear) ??
      coerceStr(custom.school_year);
  }

  return { student_number, course_year };
}

import { AlertCircle, CheckCircle, GraduationCap, Sparkles } from 'lucide-react';

export interface AIEvaluationCriterion {
  name: string;
  score: number;
  max: number;
  comment: string;
}

export type AIDocumentEvaluationReportProps = {
  /** Rubric rows from the last AI run (teacher grading). Empty = summary-only layout. */
  criteria: AIEvaluationCriterion[];
  /** Overall AI aggregate 0–100, or null if not computed yet. */
  aiScorePercent: number | null;
  /** Published staff score when available. */
  teacherScorePercent?: number | null;
  /** Stored or live summary (e.g. Strengths / Needs improvement lines). */
  summaryText?: string | null;
  heading?: string;
  /** Hide the side-by-side "Teacher grade" tile (used by AI-only grading flow). Defaults to true. */
  showTeacherGrade?: boolean;
};

function criterionPercent(c: AIEvaluationCriterion): number {
  if (c.max <= 0) return 0;
  return Math.round((c.score / c.max) * 100);
}

function parseStrengthsGaps(summary: string): { strengths: string[]; gaps: string[] } {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const s = summary.trim();
  if (!s) return { strengths, gaps };

  const low = s.toLowerCase();
  const ni = low.indexOf('needs improvement:');
  const strIdx = low.indexOf('strengths:');

  if (strIdx >= 0) {
    const after = s.slice(strIdx + 'strengths:'.length);
    const chunk = ni > strIdx ? after.slice(0, ni - strIdx - 'strengths:'.length).trim() : after.split('.')[0]?.trim() ?? '';
    chunk
      .replace(/^strengths:\s*/i, '')
      .split(/[,;]/)
      .map((x) => x.trim().replace(/\.$/, ''))
      .filter(Boolean)
      .forEach((x) => strengths.push(x));
  }
  if (ni >= 0) {
    const after = s.slice(ni + 'needs improvement:'.length).split(/\.\s*Please review/i)[0]?.trim() ?? '';
    after
      .split(/[,;]/)
      .map((x) => x.trim().replace(/\.$/, ''))
      .filter(Boolean)
      .forEach((x) => gaps.push(x));
  }
  return { strengths, gaps };
}

export default function AIDocumentEvaluationReport({
  criteria,
  aiScorePercent,
  teacherScorePercent,
  summaryText,
  heading = 'AI Analysis & Evaluation',
  showTeacherGrade = true,
}: AIDocumentEvaluationReportProps) {
  const executive = (summaryText ?? '').trim();
  const pct = aiScorePercent != null && Number.isFinite(aiScorePercent) ? Math.max(0, Math.min(100, aiScorePercent)) : null;
  const fallbackExecutive =
    !executive && pct != null && criteria.length === 0
      ? `Indicative automated score: ${pct} out of 100. Your instructor may adjust this after review — see staff feedback below.`
      : '';
  const executiveDisplay = executive || fallbackExecutive;
  const { strengths: parsedS, gaps: parsedG } = parseStrengthsGaps(executiveDisplay);

  const fromCriteriaHigh = criteria
    .filter((c) => c.max > 0 && c.score / c.max >= 0.85)
    .map((c) => `${c.name}: ${c.comment}`);
  const fromCriteriaLow = criteria
    .filter((c) => c.max > 0 && c.score / c.max < 0.75)
    .map((c) => `${c.name}: ${c.comment}`);

  const strengthsList = parsedS.length > 0 ? parsedS : fromCriteriaHigh.slice(0, 5);
  const gapsList = parsedG.length > 0 ? parsedG : fromCriteriaLow.slice(0, 5);

  const aiRingDeg = pct != null ? (pct / 100) * 360 : 0;
  const teacherPct =
    teacherScorePercent != null && Number.isFinite(teacherScorePercent)
      ? Math.max(0, Math.min(100, Math.round(teacherScorePercent)))
      : null;
  const teacherRingDeg = teacherPct != null ? (teacherPct / 100) * 360 : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-3">{heading}</p>
        <div className={`grid gap-3 ${showTeacherGrade ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
          {/* AI grade — automated rubric aggregate */}
          <div
            className="flex flex-col gap-4 rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            role="group"
            aria-label="AI grade"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                AI grade
              </p>
              <p className="text-xs text-emerald-900/80">From automated inspection (rubric).</p>
              {pct == null ? (
                <p className="text-sm font-medium text-emerald-900/70 italic">Run AI inspection to get a score.</p>
              ) : (
                <p className="text-2xl font-extrabold tabular-nums text-emerald-950 sm:hidden">
                  {pct}
                  <span className="text-sm font-bold text-emerald-700"> / 100</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 justify-center sm:pr-1">
              <div
                className="relative grid h-24 w-24 place-items-center rounded-full sm:h-28 sm:w-28"
                style={{
                  background:
                    pct == null
                      ? '#e5e7eb'
                      : `conic-gradient(rgb(5 150 105) ${aiRingDeg}deg, rgb(229 231 235) 0deg)`,
                }}
                aria-hidden
              >
                <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner sm:inset-[10px]">
                  <span className="text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">{pct ?? '—'}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[10px]">/ 100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Teacher grade — published staff score only */}
          {showTeacherGrade && (
          <div
            className={`flex flex-col gap-4 rounded-2xl border-2 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
              teacherPct != null
                ? 'border-[#84001B]/35 bg-gradient-to-br from-[#ffd21a]/15 to-white'
                : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white'
            }`}
            role="group"
            aria-label="Teacher grade"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  teacherPct != null ? 'text-[#5c0014]' : 'text-slate-600'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#84001B]" aria-hidden />
                Teacher grade
              </p>
              <p className={`text-xs ${teacherPct != null ? 'text-[#5c0014]/85' : 'text-slate-500'}`}>
                {teacherPct != null
                  ? 'Published final score (what the student sees as official).'
                  : 'Shown after the instructor publishes — not the AI draft.'}
              </p>
              {teacherPct != null ? (
                <p className="text-2xl font-extrabold tabular-nums text-[#84001B] sm:hidden">
                  {teacherPct}
                  <span className="text-sm font-bold text-[#84001B]/80"> / 100</span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-slate-500">Pending publish</p>
              )}
            </div>
            <div className="flex shrink-0 justify-center sm:pr-1">
              <div
                className="relative grid h-24 w-24 place-items-center rounded-full sm:h-28 sm:w-28"
                style={{
                  background:
                    teacherPct == null
                      ? '#e5e7eb'
                      : `conic-gradient(rgb(132 0 27) ${teacherRingDeg}deg, rgb(229 231 235) 0deg)`,
                }}
                aria-hidden
              >
                <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner sm:inset-[10px]">
                  <span className="text-xl font-extrabold tabular-nums text-[#84001B] sm:text-2xl">
                    {teacherPct ?? '—'}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[10px]">/ 100</span>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {executiveDisplay && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
            <Sparkles className="h-4 w-4 text-pink-500" aria-hidden />
            Executive summary
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm leading-relaxed text-slate-800">
            {executiveDisplay}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-900">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Key strengths
          </div>
          {strengthsList.length > 0 ? (
            <ul className="list-inside list-disc space-y-1.5 text-sm text-emerald-950/95">
              {strengthsList.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-900/80">
              Highlights will appear after AI inspection, or when rubric sections score strongly.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-950">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            Areas for improvement
          </div>
          {gapsList.length > 0 ? (
            <ul className="list-inside list-disc space-y-1.5 text-sm text-amber-950/95">
              {gapsList.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-950/85">
              No major gaps flagged in the automated pass — still review each section below and staff feedback.
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Detailed evaluation</p>
        <div className="space-y-4">
          {criteria.length > 0 ? (
            criteria.map((c, idx) => {
              const secPct = criterionPercent(c);
              return (
                <div
                  key={`${c.name}-${idx}`}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-stretch sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-400 tabular-nums">{idx + 1}</p>
                    <h4 className="text-base font-bold text-slate-900">{c.name}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{c.comment}</p>
                  </div>
                  <div className="flex w-full shrink-0 flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3 sm:w-28">
                    <span className="text-2xl font-extrabold tabular-nums text-[#84001B]">{secPct}</span>
                    <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Score / 100</span>
                  </div>
                </div>
              );
            })
          ) : executiveDisplay ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h4 className="text-base font-bold text-slate-900">Automated summary</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{executiveDisplay}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
              No AI breakdown yet. After your teacher runs inspection, scores and section notes appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

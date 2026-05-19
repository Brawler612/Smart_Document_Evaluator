import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle,
  ClipboardList,
  GraduationCap,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Sparkles,
  Table2,
} from 'lucide-react';
import {
  buildSppActionItemsMarkdown,
  getSppCategoryForCriterion,
  isSppProposalRubric,
  type SppRubricCategory,
} from '../../shared/sppProposalRubric';

export interface AIEvaluationCriterion {
  name: string;
  score: number;
  max: number;
  comment: string;
}

export type AILanguageCorrectionRow = {
  before: string;
  after: string;
  category?: string;
  note?: string;
};

export type AICorrectHighlightRow = {
  excerpt: string;
  verification: string;
  rubricTie?: string;
};

export type AIPageRewriteRow = {
  page: number;
  pageLabel?: string;
  before: string;
  after: string;
  issues?: string[];
  imagesObserved?: string[];
  rubricTie?: string;
};

export type AIPageOverviewScoreRow = {
  pageRange: string;
  scoreOutOf10: number;
  evaluation: string;
};

export type AIDiagramEvaluationRow = {
  diagram: string;
  evaluation: string;
  scoreOutOf10: number;
};

export type AIDocumentEvaluationReportProps = {
  /** Rubric rows from the last AI run (teacher grading). Empty = summary-only layout. */
  criteria: AIEvaluationCriterion[];
  /** Overall AI aggregate 0–100, or null if not computed yet. */
  aiScorePercent: number | null;
  /** Published staff score when available. */
  teacherScorePercent?: number | null;
  /** Stored or live summary (e.g. Strengths / Needs improvement lines). */
  summaryText?: string | null;
  /** Gemini paragraph on grammar, completeness, and systematic issues (from submitted text). */
  documentQualityNotes?: string | null;
  /** Before → after suggested fixes grounded in the submission. */
  languageCorrections?: AILanguageCorrectionRow[];
  /** Excerpts the model verified as correct / well aligned with the rubric. */
  correctHighlights?: AICorrectHighlightRow[];
  /** Per-page before → after rewrites covering every page / section / slide / moment in the submission. */
  pageRewrites?: AIPageRewriteRow[];
  /** Page-range narrative scores (e.g. “Pages 1–2 — Title”, 9/10) mirroring long Gemini-style document reviews. */
  documentOverviewScores?: AIPageOverviewScoreRow[];
  /** Table-style diagram / figure critiques (DFD, sequence, architecture, etc.). */
  diagramEvaluations?: AIDiagramEvaluationRow[];
  heading?: string;
  /** Hide the AI grade tile (teacher-only / instructor views). Defaults to true. */
  showAiGrade?: boolean;
  /** Hide the side-by-side "Teacher grade" tile (used by AI-only grading flow). Defaults to true. */
  showTeacherGrade?: boolean;
  /** Label above the narrative summary block (defaults to “Executive summary”). */
  executiveSummaryHeading?: string;
  /** Larger type and tiles for the teacher grading modal. */
  density?: 'default' | 'comfortable';
  /**
   * `rubric` (default): “Detailed evaluation” lists each rubric row.
   * `narrative`: same layout as the student “Grading score” dialog — one “Automated summary” block;
   * rubric rows are still used for strengths/gaps fallbacks when the summary has no Strengths:/Needs improvement: lines.
   */
  detailEvaluation?: 'rubric' | 'narrative';
  /** Scroll / emphasize the AI or Teacher score tile when opening from a split “View AI / Teacher score” control. */
  scoreSectionFocus?: 'ai' | 'teacher' | null;
  /** Group rubric by SPP category and show checklist export when `spp`. */
  rubricVariant?: 'default' | 'spp';
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
  documentQualityNotes,
  languageCorrections = [],
  correctHighlights = [],
  pageRewrites = [],
  documentOverviewScores = [],
  diagramEvaluations = [],
  heading = 'AI Analysis & Evaluation',
  showAiGrade = true,
  showTeacherGrade = true,
  executiveSummaryHeading = 'Executive summary',
  density = 'default',
  detailEvaluation = 'rubric',
  scoreSectionFocus = null,
  rubricVariant = 'default',
}: AIDocumentEvaluationReportProps) {
  const aiScoreTileRef = useRef<HTMLDivElement>(null);
  const teacherScoreTileRef = useRef<HTMLDivElement>(null);
  const [checklistCopied, setChecklistCopied] = useState(false);
  const comfy = density === 'comfortable';
  const executive = (summaryText ?? '').trim();
  const qualityNotes = (documentQualityNotes ?? '').trim();
  const corrections = languageCorrections ?? [];
  const verifiedCorrect = correctHighlights ?? [];
  const pageWalkthrough = (pageRewrites ?? []).filter((p) => p && (p.before?.trim() || p.after?.trim()));
  const overviewRows = (documentOverviewScores ?? []).filter((r) => r && r.pageRange?.trim() && r.evaluation?.trim());
  const diagramRows = (diagramEvaluations ?? []).filter((r) => r && r.diagram?.trim() && r.evaluation?.trim());
  const pct = aiScorePercent != null && Number.isFinite(aiScorePercent) ? Math.max(0, Math.min(100, aiScorePercent)) : null;
  const showRubricRows = criteria.length > 0 && detailEvaluation !== 'narrative';
  const sppChecklist =
    rubricVariant === 'spp' || (criteria.length > 0 && isSppProposalRubric(criteria));
  const sppCategories: SppRubricCategory[] = [
    'Compliance & structure',
    'Proposal content',
    'Planning & traceability',
    'Integrity & references',
    'Review deliverables',
  ];

  async function copyActionItemsChecklist() {
    const md = buildSppActionItemsMarkdown(criteria);
    try {
      await navigator.clipboard.writeText(md);
      setChecklistCopied(true);
      window.setTimeout(() => setChecklistCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  function renderRubricRow(c: AIEvaluationCriterion, idx: number) {
    const secPct = criterionPercent(c);
    const sppCat = sppChecklist ? getSppCategoryForCriterion(c.name) : null;
    return (
      <div
        key={`${c.name}-${idx}`}
        className={`flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:flex-row sm:items-stretch sm:justify-between ${
          comfy ? 'gap-5 p-5 sm:gap-8' : 'gap-4 p-4 sm:gap-6'
        }`}
      >
        <div className="min-w-0 flex-1">
          {sppCat ? (
            <p className={`font-bold uppercase tracking-wide text-emerald-800/80 ${comfy ? 'text-[10px]' : 'text-[9px]'}`}>
              {sppCat}
            </p>
          ) : null}
          <p className={`font-bold text-slate-400 tabular-nums ${comfy ? 'text-sm' : 'text-xs'}`}>{idx + 1}</p>
          <h4 className={`font-bold text-slate-900 ${comfy ? 'text-lg' : 'text-base'}`}>{c.name}</h4>
          <p className={`mt-2 leading-relaxed text-slate-700 whitespace-pre-wrap ${comfy ? 'text-[15px]' : 'text-sm'}`}>
            {c.comment}
          </p>
        </div>
        <div
          className={`flex w-full shrink-0 flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3 ${
            comfy ? 'sm:w-36' : 'sm:w-28'
          }`}
        >
          {sppChecklist ? (
            <>
              <span className={`font-extrabold tabular-nums text-[#84001B] ${comfy ? 'text-3xl' : 'text-2xl'}`}>
                {c.score}
              </span>
              <span
                className={`mt-1 font-bold uppercase tracking-wide text-slate-400 ${comfy ? 'text-[11px]' : 'text-[10px]'}`}
              >
                / {c.max} pts
              </span>
            </>
          ) : (
            <>
              <span className={`font-extrabold tabular-nums text-[#84001B] ${comfy ? 'text-3xl' : 'text-2xl'}`}>
                {secPct}
              </span>
              <span
                className={`mt-1 font-bold uppercase tracking-wide text-slate-400 ${comfy ? 'text-[11px]' : 'text-[10px]'}`}
              >
                Score / 100
              </span>
            </>
          )}
        </div>
      </div>
    );
  }
  const fallbackExecutive =
    !executive && pct != null && (criteria.length === 0 || detailEvaluation === 'narrative')
      ? `Indicative automated score: ${pct} out of 100. Your instructor may adjust this after review — see teacher feedback below.`
      : '';
  const executiveDisplay = executive || fallbackExecutive;
  /** When the rubric list is hidden, the same narrative already appears as "Executive summary" above — do not repeat it as "Automated summary". */
  const hideDetailedEvaluationSection = Boolean(executiveDisplay) && !showRubricRows;
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

  useEffect(() => {
    if (!scoreSectionFocus) return;
    const t = window.setTimeout(() => {
      const el =
        scoreSectionFocus === 'ai'
          ? aiScoreTileRef.current
          : scoreSectionFocus === 'teacher'
            ? teacherScoreTileRef.current
            : null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [scoreSectionFocus]);

  const aiFocusRing =
    scoreSectionFocus === 'ai' ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white shadow-md' : '';
  const teacherFocusRing =
    scoreSectionFocus === 'teacher' ? 'ring-2 ring-[#84001B]/55 ring-offset-2 ring-offset-white shadow-md' : '';

  const showAiTile = showAiGrade !== false;
  const scoreGridCols =
    showAiTile && showTeacherGrade ? 'sm:grid-cols-2' : 'sm:grid-cols-1';

  return (
    <div className={comfy ? 'space-y-8' : 'space-y-6'}>
      <div>
        <p
          className={`font-bold uppercase tracking-[0.12em] text-slate-500 ${comfy ? 'text-xs mb-4' : 'text-[11px] mb-3'}`}
        >
          {heading}
        </p>
        <div className={`grid ${comfy ? 'gap-4' : 'gap-3'} ${scoreGridCols}`}>
          {/* AI grade — automated rubric aggregate */}
          {showAiTile ? (
          <div
            ref={aiScoreTileRef}
            className={`flex flex-col rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-white shadow-sm sm:flex-row sm:items-center sm:justify-between ${
              comfy ? 'gap-5 p-5 sm:gap-6' : 'gap-4 p-4 sm:gap-4'
            } ${aiFocusRing}`}
            role="group"
            aria-label="AI grade"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                AI grade
              </p>
              <p className={comfy ? 'text-sm text-emerald-900/85' : 'text-xs text-emerald-900/80'}>
                {detailEvaluation === 'narrative'
                  ? 'Same style of AI report students see after your staff publish this score.'
                  : 'From automated inspection (rubric).'}
              </p>
              {pct == null ? (
                <p className={comfy ? 'text-base font-medium text-emerald-900/70 italic' : 'text-sm font-medium text-emerald-900/70 italic'}>
                  Run AI inspection to get a score.
                </p>
              ) : (
                <p className={`font-extrabold tabular-nums text-emerald-950 sm:hidden ${comfy ? 'text-3xl' : 'text-2xl'}`}>
                  {pct}
                  <span className={comfy ? 'text-lg font-bold text-emerald-700' : 'text-sm font-bold text-emerald-700'}>
                    {' '}
                    / 100
                  </span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 justify-center sm:pr-1">
              <div
                className={`relative grid place-items-center rounded-full ${
                  comfy ? 'h-32 w-32 sm:h-36 sm:w-36' : 'h-24 w-24 sm:h-28 sm:w-28'
                }`}
                style={{
                  background:
                    pct == null
                      ? '#e5e7eb'
                      : `conic-gradient(rgb(5 150 105) ${aiRingDeg}deg, rgb(229 231 235) 0deg)`,
                }}
                aria-hidden
              >
                <div
                  className={`absolute flex flex-col items-center justify-center rounded-full bg-white shadow-inner ${
                    comfy ? 'inset-[11px] sm:inset-[12px]' : 'inset-[9px] sm:inset-[10px]'
                  }`}
                >
                  <span
                    className={`font-extrabold tabular-nums text-slate-900 ${comfy ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}
                  >
                    {pct ?? '—'}
                  </span>
                  <span
                    className={`font-bold uppercase tracking-wide text-slate-400 ${comfy ? 'text-[10px] sm:text-[11px]' : 'text-[9px] sm:text-[10px]'}`}
                  >
                    / 100
                  </span>
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {/* Teacher grade — published staff score only */}
          {showTeacherGrade && (
          <div
            ref={teacherScoreTileRef}
            className={`flex flex-col rounded-2xl border-2 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
              comfy ? 'gap-5 p-5 sm:gap-6' : 'gap-4 p-4 sm:gap-4'
            } ${
              teacherPct != null
                ? 'border-[#84001B]/35 bg-gradient-to-br from-[#ffd21a]/15 to-white'
                : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white'
            } ${teacherFocusRing}`}
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
                className={`relative grid place-items-center rounded-full ${
                  comfy ? 'h-32 w-32 sm:h-36 sm:w-36' : 'h-24 w-24 sm:h-28 sm:w-28'
                }`}
                style={{
                  background:
                    teacherPct == null
                      ? '#e5e7eb'
                      : `conic-gradient(rgb(132 0 27) ${teacherRingDeg}deg, rgb(229 231 235) 0deg)`,
                }}
                aria-hidden
              >
                <div
                  className={`absolute flex flex-col items-center justify-center rounded-full bg-white shadow-inner ${
                    comfy ? 'inset-[11px] sm:inset-[12px]' : 'inset-[9px] sm:inset-[10px]'
                  }`}
                >
                  <span
                    className={`font-extrabold tabular-nums text-[#84001B] ${comfy ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}
                  >
                    {teacherPct ?? '—'}
                  </span>
                  <span
                    className={`font-bold uppercase tracking-wide text-slate-400 ${comfy ? 'text-[10px] sm:text-[11px]' : 'text-[9px] sm:text-[10px]'}`}
                  >
                    / 100
                  </span>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {executiveDisplay && (
        <div>
          <div
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-600 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <Sparkles className={comfy ? 'h-5 w-5 text-pink-500' : 'h-4 w-4 text-pink-500'} aria-hidden />
            {executiveSummaryHeading}
          </div>
          <div
            className={`rounded-2xl border border-sky-100 bg-sky-50/80 font-bold leading-relaxed text-slate-900 whitespace-pre-wrap ${
              comfy ? 'px-5 py-4 text-base' : 'px-4 py-3 text-sm'
            }`}
          >
            {executiveDisplay}
          </div>
        </div>
      )}

      {verifiedCorrect.length > 0 && (
        <div>
          <div
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-600 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <BadgeCheck className={comfy ? 'h-5 w-5 text-emerald-600' : 'h-4 w-4 text-emerald-600'} aria-hidden />
            Verified correct in the submission
          </div>
          <p className={`mb-3 text-slate-600 ${comfy ? 'text-sm' : 'text-xs'}`}>
            Short quotes from the file the AI checked and judged as accurate or well done, with how that supports scoring.
          </p>
          <ul className={`space-y-3 ${comfy ? 'text-[15px]' : 'text-sm'}`}>
            {verifiedCorrect.map((row, i) => (
              <li
                key={i}
                className={`rounded-2xl border border-emerald-200/80 bg-emerald-50/50 shadow-sm ${
                  comfy ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
                }`}
              >
                <blockquote className="border-l-4 border-emerald-500 pl-3 font-semibold text-slate-900 leading-relaxed">
                  {row.excerpt}
                </blockquote>
                <p className={`mt-2 leading-relaxed text-slate-800 ${comfy ? 'font-semibold' : 'font-medium'}`}>
                  {row.verification}
                </p>
                {row.rubricTie ? (
                  <p className={`mt-1.5 text-slate-500 ${comfy ? 'text-sm' : 'text-xs'}`}>
                    <span className="font-bold uppercase tracking-wide text-slate-400">Rubric tie</span> — {row.rubricTie}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {qualityNotes && (
        <div>
          <div
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-600 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <Languages className={comfy ? 'h-5 w-5 text-violet-500' : 'h-4 w-4 text-violet-500'} aria-hidden />
            Grammar, completeness & accuracy
          </div>
          <div
            className={`rounded-2xl border border-violet-100 bg-violet-50/85 leading-relaxed text-slate-900 ${
              comfy ? 'px-5 py-4 text-[15px] font-semibold' : 'px-4 py-3 text-sm font-semibold'
            }`}
          >
            {qualityNotes}
          </div>
        </div>
      )}

      <div className={`grid md:grid-cols-2 ${comfy ? 'gap-5' : 'gap-4'}`}>
        <div className={`rounded-2xl border border-emerald-200/80 bg-emerald-50/90 shadow-sm ${comfy ? 'p-5' : 'p-4'}`}>
          <div
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.1em] text-emerald-900 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Key strengths
          </div>
          {strengthsList.length > 0 ? (
            <ul
              className={`list-inside list-disc text-emerald-950/95 ${comfy ? 'space-y-2 text-[15px]' : 'space-y-1.5 text-sm'}`}
            >
              {strengthsList.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className={comfy ? 'text-[15px] text-emerald-900/80' : 'text-sm text-emerald-900/80'}>
              Highlights will appear after AI inspection, or when rubric sections score strongly.
            </p>
          )}
        </div>
        <div className={`rounded-2xl border border-amber-200/90 bg-amber-50/90 shadow-sm ${comfy ? 'p-5' : 'p-4'}`}>
          <div
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.1em] text-amber-950 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            Areas for improvement
          </div>
          {gapsList.length > 0 ? (
            <ul
              className={`list-inside list-disc text-amber-950/95 ${comfy ? 'space-y-2 text-[15px]' : 'space-y-1.5 text-sm'}`}
            >
              {gapsList.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className={comfy ? 'text-[15px] text-amber-950/85' : 'text-sm text-amber-950/85'}>
              No major gaps flagged in the automated pass — still review each section below and teacher feedback.
            </p>
          )}
        </div>
      </div>

      {overviewRows.length > 0 && (
        <div>
          <p
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <LayoutGrid className="h-4 w-4 text-sky-600 shrink-0" aria-hidden />
            Document overview & scoring
          </p>
          <p className={`mb-4 text-slate-600 ${comfy ? 'text-sm' : 'text-xs'}`}>
            Section-by-section quality the model inferred from the submission (page ranges, chapters, or time spans for
            media). Scores are out of 10 for that span only — not the course grade.
          </p>
          <ul className={`space-y-3 ${comfy ? 'text-[15px]' : 'text-sm'}`}>
            {overviewRows.map((row, i) => (
              <li
                key={`${row.pageRange}-${i}`}
                className={`rounded-2xl border border-sky-200/80 bg-sky-50/50 shadow-sm ${
                  comfy ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <span className="font-bold text-slate-900">{row.pageRange}</span>
                  <span className="tabular-nums rounded-lg bg-sky-900 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    {row.scoreOutOf10}/10
                  </span>
                </div>
                <p className={`leading-relaxed text-slate-800 whitespace-pre-wrap ${comfy ? 'font-semibold' : 'font-medium'}`}>
                  {row.evaluation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diagramRows.length > 0 && (
        <div>
          <p
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <Table2 className="h-4 w-4 text-violet-600 shrink-0" aria-hidden />
            Visual & diagram evaluation
          </p>
          <p className={`mb-3 text-slate-600 ${comfy ? 'text-sm' : 'text-xs'}`}>
            Each row is one figure or diagram the model identified (including screenshots and photos of boards). Treat
            scores as advisory until you have confirmed against the real file.
          </p>
          <div className={`overflow-x-auto rounded-2xl border border-violet-200/90 bg-white shadow-sm ${comfy ? 'text-sm' : 'text-xs'}`}>
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-violet-100 bg-violet-50/90">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500 w-[22%]">Diagram / image</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500">Evaluation</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500 w-[6rem] text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {diagramRows.map((row, i) => (
                  <tr key={`${row.diagram}-${i}`} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-800 whitespace-pre-wrap break-words">
                      {row.diagram}
                    </td>
                    <td className="px-3 py-3 text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                      {row.evaluation}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-violet-900 whitespace-nowrap">
                      {row.scoreOutOf10}/10
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pageWalkthrough.length > 0 && (
        <div>
          <p
            className={`mb-2 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <BookOpen className="h-4 w-4 text-[#84001B] shrink-0" aria-hidden />
            Per-page walkthrough (before → after)
          </p>
          <p className={`mb-4 text-slate-600 ${comfy ? 'text-sm' : 'text-xs'}`}>
            One card for every page / slide / section / moment Gemini found in the submission — SRS, SDD, SPMP, STD, lab
            reports, slide decks, scanned pages, photographed work, audio / video clips are all covered. The left column shows
            what is currently on that page; the right column is the AI&apos;s improved version applying the listed fixes.
          </p>
          <ol className={`space-y-4 ${comfy ? 'text-[15px]' : 'text-sm'}`}>
            {pageWalkthrough.map((row, idx) => {
              const issues = row.issues ?? [];
              const images = row.imagesObserved ?? [];
              const label = row.pageLabel?.trim() || `Page ${row.page}`;
              return (
                <li
                  key={`${row.page}-${idx}`}
                  className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-[#fff8f9] via-white to-emerald-50/40 px-4 py-2.5">
                    <span className="inline-flex items-center justify-center min-w-[2.25rem] h-7 px-2 rounded-lg bg-[#84001B] text-white text-[11px] font-bold tabular-nums tracking-wide">
                      {row.page}
                    </span>
                    <span className={`font-bold text-slate-900 ${comfy ? 'text-base' : 'text-sm'}`}>{label}</span>
                    {row.rubricTie ? (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-300/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {row.rubricTie}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 p-4">
                    <div className="rounded-xl border border-rose-200/80 bg-rose-50/55 p-3">
                      <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-900/90">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                        Before — on the page now
                      </p>
                      <p className={`whitespace-pre-wrap leading-relaxed text-rose-950 ${comfy ? 'text-[14px]' : 'text-[13px]'}`}>
                        {row.before || '— (no content extracted for this page)'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/55 p-3">
                      <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900/90">
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                        After — AI improved version
                      </p>
                      <p className={`whitespace-pre-wrap leading-relaxed text-emerald-950 ${comfy ? 'text-[14px]' : 'text-[13px]'}`}>
                        {row.after || '— (no rewrite suggested for this page)'}
                      </p>
                    </div>
                  </div>
                  {(issues.length > 0 || images.length > 0) && (
                    <div className="grid gap-3 md:grid-cols-2 px-4 pb-4 -mt-1">
                      {issues.length > 0 ? (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3">
                          <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-900/90">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                            Issues on this page
                          </p>
                          <ul className="list-disc list-inside text-amber-950/95 text-[12.5px] leading-relaxed space-y-1">
                            {issues.map((it, i) => (
                              <li key={i}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div aria-hidden />
                      )}
                      {images.length > 0 ? (
                        <div className="rounded-xl border border-violet-200/80 bg-violet-50/60 p-3">
                          <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-900/90">
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                            Images / diagrams seen
                          </p>
                          <ul className="list-disc list-inside text-violet-950/95 text-[12.5px] leading-relaxed space-y-1">
                            {images.map((it, i) => (
                              <li key={i}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div aria-hidden />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {corrections.length > 0 && (
        <div>
          <p
            className={`mb-3 flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500 ${
              comfy ? 'text-xs' : 'text-[11px]'
            }`}
          >
            <ArrowRight className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
            Suggested corrections (before → after)
          </p>
          <p className={`mb-3 text-slate-600 ${comfy ? 'text-sm' : 'text-xs'}`}>
            Excerpts from your submitted text with AI-suggested improvements. Your instructor may accept, change, or
            ignore these suggestions in the final grade.
          </p>
          <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${comfy ? 'text-sm' : 'text-xs'}`}>
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500 w-[22%]">Type</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500">Before (from submission)</th>
                  <th className="px-2 py-2.5 w-8" aria-hidden />
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500">After (suggested)</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wide text-slate-500 w-[26%]">Note</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-700 capitalize whitespace-nowrap">
                      {row.category || '—'}
                    </td>
                    <td className="px-3 py-3 text-rose-900/95 whitespace-pre-wrap break-words font-medium bg-rose-50/40">
                      {row.before}
                    </td>
                    <td className="px-1 py-3 text-center text-emerald-600">
                      <ArrowRight className="inline h-4 w-4" aria-hidden />
                    </td>
                    <td className="px-3 py-3 text-emerald-950 whitespace-pre-wrap break-words font-semibold bg-emerald-50/35">
                      {row.after}
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-pre-wrap break-words">
                      {row.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hideDetailedEvaluationSection && (
      <div>
        <p
          className={`mb-3 font-bold uppercase tracking-[0.12em] text-slate-500 ${comfy ? 'text-xs' : 'text-[11px]'}`}
        >
          {sppChecklist ? 'SPP checklist (20 criteria)' : 'Detailed evaluation'}
        </p>
        {sppChecklist && criteria.length > 0 ? (
          <button
            type="button"
            onClick={() => void copyActionItemsChecklist()}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {checklistCopied ? 'Copied!' : 'Copy peer-review action items'}
          </button>
        ) : null}
        <div className={comfy ? 'space-y-5' : 'space-y-4'}>
          {showRubricRows ? (
            sppChecklist
              ? sppCategories.flatMap((cat) => {
                  const rows = criteria.filter((c) => getSppCategoryForCriterion(c.name) === cat);
                  if (rows.length === 0) return [];
                  return [
                    <p
                      key={`cat-${cat}`}
                      className={`font-bold uppercase tracking-wide text-[#84001B]/90 ${comfy ? 'text-xs' : 'text-[10px]'}`}
                    >
                      {cat}
                    </p>,
                    ...rows.map((c) => renderRubricRow(c, criteria.indexOf(c))),
                  ];
                })
              : criteria.map((c, idx) => renderRubricRow(c, idx))
          ) : executiveDisplay ? (
            <div className={`rounded-2xl border border-slate-200/90 bg-white shadow-sm ${comfy ? 'p-5' : 'p-4'}`}>
              <h4 className={`font-bold text-slate-900 ${comfy ? 'text-lg' : 'text-base'}`}>Automated summary</h4>
              <p
                className={`mt-2 font-bold leading-relaxed text-slate-800 ${comfy ? 'text-[15px]' : 'text-sm'}`}
              >
                {executiveDisplay}
              </p>
            </div>
          ) : (
            <p
              className={`rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-slate-500 ${
                comfy ? 'text-[15px]' : 'text-sm'
              }`}
            >
              No AI breakdown yet. After your teacher runs inspection, scores and section notes appear here.
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, FileText, Sparkles } from 'lucide-react';
import {
  SPP_PROPOSAL_RUBRIC,
  alignCriteriaToSppRubric,
  buildSppActionItemsMarkdown,
  sppCriterionPartNumber,
  sppCriterionShortLabel,
} from '../../shared/sppProposalRubric';
import type { RubricCriterionRow } from '../../shared/geminiDocumentEvaluation';

export type SppProposalEvaluationReportProps = {
  criteria: RubricCriterionRow[];
  scorePercent: number | null;
  summaryText?: string | null;
  loading?: boolean;
};

function partScoreOutOf100(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((score / max) * 100)));
}

function parseExecutiveSummary(summary: string): {
  body: string;
  strengthBullets: string[];
  improvementBullets: string[];
} {
  const s = summary.trim();
  const low = s.toLowerCase();
  const ni = low.indexOf('needs improvement:');
  const st = low.indexOf('strengths:');

  let body = s;
  let strengthsRaw = '';
  let gapsRaw = '';

  if (st >= 0) {
    body = s.slice(0, st).trim();
    strengthsRaw = s.slice(st + 'strengths:'.length, ni > st ? ni : undefined).trim();
  }
  if (ni >= 0) {
    if (st < 0) body = s.slice(0, ni).trim();
    gapsRaw = s.slice(ni + 'needs improvement:'.length).trim();
  }

  body = body.replace(/\.$/, '').trim();

  const toBullets = (raw: string): string[] => {
    if (!raw) return [];
    const parts = raw
      .split(/\n|(?<=[.!?])\s+(?=[A-Z])|;\s+/)
      .map((p) => p.trim().replace(/^[-•*]\s*/, ''))
      .filter(Boolean);
    if (parts.length <= 1 && raw.includes(',')) {
      return raw
        .split(/,(?![^(]*\))/)
        .map((p) => p.trim())
        .filter((p) => p.length > 8);
    }
    return parts.length > 0 ? parts : [raw];
  };

  return {
    body,
    strengthBullets: toBullets(strengthsRaw.replace(/\.$/, '')),
    improvementBullets: toBullets(gapsRaw.replace(/\.$/, '')),
  };
}

function deriveBulletsFromParts(rows: RubricCriterionRow[]): {
  strengths: string[];
  improvements: string[];
} {
  const strengths: string[] = [];
  const improvements: string[] = [];
  for (const c of rows) {
    const pct = partScoreOutOf100(c.score, c.max);
    const label = sppCriterionShortLabel(c.name);
    if (pct >= 85 && c.comment) {
      strengths.push(`${label}: ${c.comment.split(/[.!?]/)[0]?.trim() || c.comment}`.slice(0, 200));
    } else if (pct < 75 && c.comment) {
      improvements.push(`${label}: ${c.comment.split(/[.!?]/)[0]?.trim() || c.comment}`.slice(0, 200));
    }
  }
  return { strengths: strengths.slice(0, 5), improvements: improvements.slice(0, 5) };
}

export default function SppProposalEvaluationReport({
  criteria,
  scorePercent,
  summaryText,
  loading = false,
}: SppProposalEvaluationReportProps) {
  const [copied, setCopied] = useState(false);

  const isPending = !loading && criteria.length === 0;
  const scoredRows = useMemo(() => alignCriteriaToSppRubric(criteria), [criteria]);
  const rows = useMemo(
    () =>
      isPending
        ? SPP_PROPOSAL_RUBRIC.map((def) => ({ name: def.name, score: 0, max: def.max, comment: '' }))
        : scoredRows,
    [isPending, scoredRows]
  );

  const totalPts = scoredRows.reduce((s, c) => s + c.score, 0);
  const maxPts = scoredRows.reduce((s, c) => s + c.max, 0);
  const pct =
    !isPending && (scorePercent != null || maxPts > 0)
      ? scorePercent ?? (maxPts > 0 ? Math.round((totalPts / maxPts) * 100) : null)
      : null;

  const parsed = parseExecutiveSummary(summaryText ?? '');
  const derived = useMemo(() => deriveBulletsFromParts(scoredRows), [scoredRows]);
  const strengthBullets =
    parsed.strengthBullets.length > 0 ? parsed.strengthBullets : !isPending ? derived.strengths : [];
  const improvementBullets =
    parsed.improvementBullets.length > 0
      ? parsed.improvementBullets
      : !isPending
        ? derived.improvements.length > 0
          ? derived.improvements
          : ['No major weaknesses were identified in the automated review.']
        : [];

  async function copyNotes() {
    if (isPending) return;
    try {
      await navigator.clipboard.writeText(buildSppActionItemsMarkdown(scoredRows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  if (loading && criteria.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/80" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/80" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2">
          <FileText className="h-5 w-5 text-[#84001B]" aria-hidden />
          AI Analysis &amp; Evaluation
        </h3>
        {!isPending ? (
          <button
            type="button"
            onClick={() => void copyNotes()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {copied ? 'Copied' : 'Copy notes'}
          </button>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-center text-sm text-slate-600 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3">
          Press <span className="font-bold text-[#84001B]">Run SPP Evaluator</span> to generate scores for Parts
          1–7.
        </p>
      ) : null}

      {/* Overall score */}
      {!isPending && pct != null ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Overall score</p>
            <p className="text-xs text-slate-500 mt-0.5">Aggregated across Parts 1–7 (Project Proposal Guide)</p>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 tabular-nums">
              AI score: <span className="text-[#84001B]">{pct}</span>
            </p>
            <p className="mt-1 text-sm text-slate-600 tabular-nums">
              Raw points: {totalPts} / {maxPts}
            </p>
          </div>
          <div
            className="relative mx-auto grid h-28 w-28 shrink-0 place-items-center rounded-full sm:mx-0"
            style={{
              background: `conic-gradient(#84001B ${(pct / 100) * 360}deg, #e5e7eb 0deg)`,
            }}
            aria-hidden
          >
            <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
              <span className="text-3xl font-extrabold tabular-nums text-[#84001B]">{pct}</span>
              <span className="text-[10px] font-bold uppercase text-slate-400">/ 100</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Executive summary */}
      {!isPending && (parsed.body || summaryText) ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Executive summary
          </p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {parsed.body || summaryText}
          </p>
        </div>
      ) : null}

      {/* Strengths + improvements */}
      {!isPending && (strengthBullets.length > 0 || improvementBullets.length > 0) ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-900 mb-3 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Key strengths
            </p>
            <ul className="space-y-2.5 text-sm text-slate-800 leading-relaxed list-none">
              {strengthBullets.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-950 mb-3 inline-flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" aria-hidden />
              Areas for improvement
            </p>
            <ul className="space-y-2.5 text-sm text-slate-800 leading-relaxed list-none">
              {improvementBullets.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Detailed evaluation */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">
          Detailed evaluation
        </p>
        <div className="space-y-3">
          {rows.map((c) => {
            const id = sppCriterionPartNumber(c.name);
            const short = sppCriterionShortLabel(c.name);
            const sectionPct = isPending ? null : partScoreOutOf100(c.score, c.max);

            return (
              <div
                key={c.name}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-bold text-slate-900 mb-2">
                    {id} {short}
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {isPending
                      ? 'Run the evaluator to receive AI feedback for this part of the proposal guide.'
                      : c.comment || 'No feedback generated for this section.'}
                  </p>
                </div>
                <div className="flex shrink-0 sm:pt-1">
                  <div
                    className="grid min-w-[5.5rem] place-items-center rounded-xl bg-[#84001B] px-4 py-3 text-center text-white shadow-md"
                    aria-label={
                      sectionPct != null ? `Score ${sectionPct} out of 100` : 'Score pending'
                    }
                  >
                    <span className="text-3xl font-extrabold tabular-nums leading-none">
                      {sectionPct ?? '—'}
                    </span>
                    <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                      Score / 100
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

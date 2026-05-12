import { Link } from 'react-router-dom';
import {
  FileText,
  ChevronRight,
  Calendar,
  CheckCircle,
  Star,
  Undo2,
  Trash2,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import type { TeacherSubmission } from '../../lib/teacherSubmissionLoad';
import { submissionQueueTitle } from '../../lib/teacherSubmissionLoad';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from '../SubmissionOpenLink';
import {
  formatStackedDateTime,
  rosterStatusChip,
  studentIdBadge,
  submissionHasViewableAiScore,
  submissionHasViewableTeacherScore,
} from '../../lib/submissionRosterPresentation';
import { teacherMaroonTheadClasses } from './TeacherWorkspaceChrome';

type Props = {
  rows: TeacherSubmission[];
  resubmitSavingId: string | null;
  gradeHref: (submissionId: string) => string;
  onRequestResubmit: (s: TeacherSubmission) => void;
  /** When set, trash icon is shown per row (e.g. class list page). */
  onDeleteRow?: (s: TeacherSubmission) => void;
  deleteBusyId?: string | null;
  /** Larger labeled buttons — matches directory / grading toolbar style for discoverability. */
  labeledActions?: boolean;
  /** Hide Evaluate / Resubmit controls (e.g. roster defers to Grading workspace for those actions). */
  omitGradeAndRedo?: boolean;
  /** When set, that row gets a short focus ring (e.g. deep-link from Inbox). */
  highlightSubmissionId?: string | null;
  /** Omit outer chrome when parent already wraps with class-list shell + amber cue. */
  embedded?: boolean;
  /** Open read-only AI score summary (modal on pages that wire it). */
  onViewAiScore?: (s: TeacherSubmission) => void;
  /** Open read-only teacher score summary. */
  onViewTeacherScore?: (s: TeacherSubmission) => void;
  /** Hide AI / Teacher view controls in the table (e.g. roster spreadsheet defers to card list below). */
  hideViewScore?: boolean;
};

const labeledScoreBtn =
  'inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-500 disabled:opacity-50 leading-tight';

function RosterScoreActionButtons({
  s,
  labeled,
  hideViewScore,
  gradeHref,
  onViewAiScore,
  onViewTeacherScore,
  deleteBusyId,
  resubmitSavingId,
}: {
  s: TeacherSubmission;
  labeled: boolean;
  hideViewScore: boolean;
  gradeHref: (submissionId: string) => string;
  onViewAiScore?: (s: TeacherSubmission) => void;
  onViewTeacherScore?: (s: TeacherSubmission) => void;
  deleteBusyId?: string | null;
  resubmitSavingId: string | null;
}) {
  if (hideViewScore) return null;
  const hasAi = submissionHasViewableAiScore(s);
  const hasT = submissionHasViewableTeacherScore(s);
  if (!hasAi && !hasT) return null;

  const busy = Boolean(deleteBusyId === s.id || resubmitSavingId === s.id);

  if (labeled) {
    return (
      <>
        {hasAi &&
          (onViewAiScore ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onViewAiScore(s)}
              className={labeledScoreBtn}
              title="View automated AI score and AI-generated feedback"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
              View AI score
            </button>
          ) : (
            <Link
              to={gradeHref(s.id)}
              className={labeledScoreBtn}
              title="Open grading workspace to see the AI draft score"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
              View AI score
            </Link>
          ))}
        {hasT &&
          (onViewTeacherScore ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onViewTeacherScore(s)}
              className={labeledScoreBtn}
              title="View instructor-published score and context"
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden />
              View Teacher score
            </button>
          ) : (
            <Link
              to={gradeHref(s.id)}
              className={labeledScoreBtn}
              title="Open grading workspace to see the published teacher score"
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden />
              View Teacher score
            </Link>
          ))}
      </>
    );
  }

  return (
    <>
      {hasAi &&
        (onViewAiScore ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onViewAiScore(s)}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50"
            aria-label="View AI score"
            title="View AI score"
          >
            <Sparkles className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <Link
            to={gradeHref(s.id)}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            aria-label="View AI score in grading workspace"
            title="View AI score in grading workspace"
          >
            <Sparkles className="w-4 h-4" aria-hidden />
          </Link>
        ))}
      {hasT &&
        (onViewTeacherScore ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onViewTeacherScore(s)}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-500 shadow-sm shadow-amber-500/25 disabled:opacity-50"
            aria-label="View Teacher score"
            title="View Teacher score"
          >
            <GraduationCap className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <Link
            to={gradeHref(s.id)}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-500 shadow-sm shadow-amber-500/25"
            aria-label="View Teacher score in grading workspace"
            title="View Teacher score in grading workspace"
          >
            <GraduationCap className="w-4 h-4" aria-hidden />
          </Link>
        ))}
    </>
  );
}

export default function TeacherSubmissionRosterTable({
  rows,
  resubmitSavingId,
  gradeHref,
  onRequestResubmit,
  onDeleteRow,
  deleteBusyId,
  labeledActions = false,
  omitGradeAndRedo = false,
  highlightSubmissionId = null,
  embedded = false,
  onViewAiScore,
  onViewTeacherScore,
  hideViewScore = false,
}: Props) {
  const actionsMin = labeledActions ? (omitGradeAndRedo ? 'min-w-[260px]' : 'min-w-[240px]') : 'min-w-[160px]';
  return (
    <div
      className={
        embedded
          ? 'bg-white overflow-hidden'
          : 'bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm border-collapse">
          <thead>
            <tr className={teacherMaroonTheadClasses}>
              <th className="px-3 py-3 text-left min-w-[96px]">Title</th>
              <th className="px-3 py-3 text-left min-w-[140px]">File name</th>
              <th className="px-3 py-3 text-left min-w-[120px]">Student ID</th>
              <th className="px-3 py-3 text-left min-w-[140px]">Student name</th>
              <th className="px-3 py-3 text-left min-w-[112px]">Date submitted</th>
              <th className="px-3 py-3 text-left min-w-[100px]">Status</th>
              <th className={`px-3 py-3 text-right ${actionsMin}`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((s) => {
              const subDm = formatStackedDateTime(s.submitted_at);
              const roster = rosterStatusChip(s);
              return (
                <tr
                  key={s.id}
                  id={`submission-roster-desktop-${s.id}`}
                  className={`hover:bg-gray-50/80 transition-colors scroll-mt-24 ${
                    highlightSubmissionId && highlightSubmissionId === s.id
                      ? 'outline outline-2 outline-offset-[-2px] outline-[#84001B]/40 bg-[#fff8f9]'
                      : ''
                  }`}
                >
                  <td className="px-3 py-3 align-middle text-gray-900 font-medium min-w-0">
                    <span className="truncate block max-w-[14rem]" title={submissionQueueTitle(s)}>
                      {submissionQueueTitle(s)}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle min-w-0">
                    <span className="inline-flex items-center gap-2 min-w-0 max-w-[16rem]">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                      {submissionHasOpenableFileUrl(s.file_url) ? (
                        <SubmissionOpenLink
                          raw={s.file_url!.trim()}
                          fileName={s.file_name}
                          className="font-medium text-[#84001B] hover:underline truncate"
                        >
                          {s.file_name}
                        </SubmissionOpenLink>
                      ) : (
                        <span className="font-medium text-gray-800 truncate">{s.file_name}</span>
                      )}
                    </span>
                    {s.score != null ? (
                      <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3" aria-hidden />
                        {s.score}%
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className="inline-block rounded-lg bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1">
                      {studentIdBadge(s)}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle text-gray-900 font-medium truncate max-w-[12rem]" title={s.users?.full_name}>
                    {s.users?.full_name ? (
                      <Link
                        to={gradeHref(s.id)}
                        className="font-medium text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
                      >
                        {s.users.full_name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="inline-flex gap-2 text-xs text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                      <div>
                        <div>{subDm.line1}</div>
                        {subDm.line2 ? <div className="text-gray-400">{subDm.line2}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${roster.className}`}
                    >
                      {roster.showCheck ? <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> : null}
                      {roster.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle text-right">
                    {labeledActions ? (
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <RosterScoreActionButtons
                          s={s}
                          labeled
                          hideViewScore={hideViewScore}
                          gradeHref={gradeHref}
                          onViewAiScore={onViewAiScore}
                          onViewTeacherScore={onViewTeacherScore}
                          deleteBusyId={deleteBusyId}
                          resubmitSavingId={resubmitSavingId}
                        />
                        {!omitGradeAndRedo ? (
                          <>
                            <Link
                              to={gradeHref(s.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#84001B]/25 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#84001B] shadow-sm hover:bg-[#84001B] hover:text-white hover:border-[#84001B] transition-colors"
                              title={s.file_name ? `Evaluate · ${s.file_name}` : 'Open grading workspace'}
                            >
                              Evaluate
                              <ChevronRight className="w-3.5 h-3.5 opacity-80" aria-hidden />
                            </Link>
                            <button
                              type="button"
                              disabled={resubmitSavingId === s.id || deleteBusyId === s.id}
                              onClick={() => onRequestResubmit(s)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 shadow-sm"
                              title="Request resubmission"
                            >
                              <Undo2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              Redo
                            </button>
                          </>
                        ) : null}
                        {onDeleteRow ? (
                          <button
                            type="button"
                            disabled={deleteBusyId === s.id || resubmitSavingId === s.id}
                            onClick={() => onDeleteRow(s)}
                            className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 shadow-sm"
                            title="Delete submission"
                          >
                            Delete
                          </button>
                        ) : omitGradeAndRedo ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-1 flex-wrap">
                        <RosterScoreActionButtons
                          s={s}
                          labeled={false}
                          hideViewScore={hideViewScore}
                          gradeHref={gradeHref}
                          onViewAiScore={onViewAiScore}
                          onViewTeacherScore={onViewTeacherScore}
                          deleteBusyId={deleteBusyId}
                          resubmitSavingId={resubmitSavingId}
                        />
                        {!omitGradeAndRedo ? (
                          <>
                            <Link
                              to={gradeHref(s.id)}
                              className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#84001B]"
                              aria-label="Open grading workspace"
                              title="Evaluate in grading workspace"
                            >
                              <ChevronRight className="w-4 h-4" aria-hidden />
                            </Link>
                            <button
                              type="button"
                              disabled={resubmitSavingId === s.id || deleteBusyId === s.id}
                              onClick={() => onRequestResubmit(s)}
                              className="inline-flex items-center justify-center p-2 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                              aria-label={`Request resubmission for ${s.file_name}`}
                              title="Request resubmission (empty / incomplete file)"
                            >
                              <Undo2 className="w-3.5 h-3.5" aria-hidden />
                            </button>
                          </>
                        ) : null}
                        {onDeleteRow ? (
                          <button
                            type="button"
                            disabled={deleteBusyId === s.id || resubmitSavingId === s.id}
                            onClick={() => onDeleteRow(s)}
                            className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50"
                            aria-label={`Delete ${s.file_name}`}
                            title="Delete submission"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        ) : omitGradeAndRedo ? (
                          <span className="text-xs text-gray-400 pr-2">—</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

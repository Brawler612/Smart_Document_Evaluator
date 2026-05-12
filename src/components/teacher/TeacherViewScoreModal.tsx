import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import AIDocumentEvaluationReport from '../AIDocumentEvaluationReport';
import { parsePersistedAiDraftSummary } from '../../lib/geminiDocumentEvaluation';
import { gradingLinkForSubmission } from '../../lib/gradingRoutes';
import { submissionQueueTitle, type TeacherSubmission } from '../../lib/teacherSubmissionLoad';

export default function TeacherViewScoreModal({
  row,
  focus = 'both',
  onClose,
}: {
  row: TeacherSubmission;
  /** Which score path this dialog represents — each mode hides the other lane’s data. */
  focus?: 'ai' | 'teacher' | 'both';
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const aiDraftParsed = useMemo(
    () => parsePersistedAiDraftSummary((row.ai_draft_summary ?? '').trim()),
    [row.ai_draft_summary]
  );

  const taskTitle = submissionQueueTitle(row);

  const feedbackBody = (row.feedback ?? '').trim();

  const report =
    focus === 'teacher' ? (
      <AIDocumentEvaluationReport
        criteria={[]}
        aiScorePercent={null}
        teacherScorePercent={row.score}
        summaryText={feedbackBody || 'No instructor written feedback yet.'}
        documentQualityNotes={null}
        languageCorrections={[]}
        correctHighlights={[]}
        heading="Teacher score"
        executiveSummaryHeading="Instructor feedback"
        detailEvaluation="narrative"
        density="comfortable"
        showAiGrade={false}
        showTeacherGrade
        scoreSectionFocus="teacher"
      />
    ) : focus === 'ai' ? (
      <AIDocumentEvaluationReport
        criteria={[]}
        aiScorePercent={row.ai_draft_score}
        teacherScorePercent={null}
        summaryText={aiDraftParsed.visibleSummary || undefined}
        documentQualityNotes={aiDraftParsed.documentQualityNotes || null}
        languageCorrections={aiDraftParsed.languageCorrections}
        correctHighlights={aiDraftParsed.correctHighlights}
        pageRewrites={aiDraftParsed.pageRewrites}
        documentOverviewScores={aiDraftParsed.documentOverviewScores}
        diagramEvaluations={aiDraftParsed.diagramEvaluations}
        heading="AI score"
        detailEvaluation="narrative"
        density="comfortable"
        showAiGrade
        showTeacherGrade={false}
        scoreSectionFocus="ai"
      />
    ) : (
      <AIDocumentEvaluationReport
        criteria={[]}
        aiScorePercent={row.ai_draft_score}
        teacherScorePercent={row.score}
        summaryText={aiDraftParsed.visibleSummary || undefined}
        documentQualityNotes={aiDraftParsed.documentQualityNotes || null}
        languageCorrections={aiDraftParsed.languageCorrections}
        correctHighlights={aiDraftParsed.correctHighlights}
        pageRewrites={aiDraftParsed.pageRewrites}
        documentOverviewScores={aiDraftParsed.documentOverviewScores}
        diagramEvaluations={aiDraftParsed.diagramEvaluations}
        heading="AI and Teacher score"
        detailEvaluation="narrative"
        density="comfortable"
        showAiGrade
        showTeacherGrade
        scoreSectionFocus={null}
      />
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-view-score-title"
        className="relative flex w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200/90 max-h-[min(94vh,56rem)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#84001B]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="shrink-0 border-b border-slate-100 px-6 pt-5 pb-4 pr-14">
          <h2 id="roster-view-score-title" className="font-bold text-slate-900 text-lg">
            {focus === 'ai' ? 'AI score' : focus === 'teacher' ? 'Teacher score' : 'Grading score'}
          </h2>
          <p className="text-sm text-slate-500 truncate mt-1">{row.file_name}</p>
          <p className="text-xs text-slate-500 mt-1">
            {(row.users?.full_name ?? '').trim() || 'Learner'}
            {row.users?.email ? ` · ${row.users.email}` : ''}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 truncate" title={taskTitle}>
            {taskTitle}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {report}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-100 pt-4">
            <Link
              to={gradingLinkForSubmission(row.id)}
              onClick={onClose}
              className="text-sm font-semibold text-[#84001B] hover:underline"
            >
              Open full grading workspace
            </Link>
            <span className="text-xs text-slate-400">
              {focus === 'ai'
                ? '— This summary is from the AI draft only; publishing from Grade AI updates only the AI snapshot.'
                : focus === 'teacher'
                  ? '— This is the instructor lane; publishing from Grade Teacher updates only the official score and feedback.'
                  : 'to edit rubric, request redo, or change grades'}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

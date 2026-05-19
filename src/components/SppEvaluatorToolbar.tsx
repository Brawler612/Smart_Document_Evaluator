import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { SubmissionOpenLink, submissionHasOpenableFileUrl } from './SubmissionOpenLink';

export type SppEvaluatorToolbarProps = {
  fileName: string;
  fileOpenRaw: string;
  inspectionText: string;
  onInspectionTextChange: (text: string) => void;
  readOnly?: boolean;
  hasMedia?: boolean;
  children?: ReactNode;
};

export default function SppEvaluatorToolbar({
  fileName,
  fileOpenRaw,
  inspectionText,
  onInspectionTextChange,
  readOnly = false,
  hasMedia = false,
  children,
}: SppEvaluatorToolbarProps) {
  const [pasteOpen, setPasteOpen] = useState(false);

  const wordCount = useMemo(
    () => inspectionText.trim().split(/\s+/).filter(Boolean).length,
    [inspectionText]
  );
  const hasFile = submissionHasOpenableFileUrl(fileOpenRaw);
  const ready = wordCount > 0 || hasMedia;

  const statusLabel = !ready
    ? 'Need file or pasted text'
    : hasMedia && wordCount === 0
      ? 'PDF → Gemini'
      : `${wordCount.toLocaleString()} words`;

  const StatusIcon = !ready ? AlertTriangle : CheckCircle2;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <FileText className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900" title={fileName}>
              {fileName || 'Submission'}
            </p>
            <p
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                ready ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <StatusIcon className="h-3 w-3 shrink-0" aria-hidden />
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {hasFile ? (
            <SubmissionOpenLink
              raw={fileOpenRaw}
              fileName={fileName}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Open file
            </SubmissionOpenLink>
          ) : null}
          {!readOnly && !ready ? (
            <button
              type="button"
              onClick={() => setPasteOpen((o) => !o)}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              {pasteOpen ? 'Hide' : 'Paste text'}
            </button>
          ) : null}
          {children}
        </div>
      </div>

      {pasteOpen && !readOnly ? (
        <textarea
          value={inspectionText}
          onChange={(e) => onInspectionTextChange(e.target.value)}
          rows={4}
          placeholder="Paste proposal text if the file could not be read…"
          className="w-full rounded-lg border border-amber-200 bg-amber-50/30 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      ) : null}
    </div>
  );
}

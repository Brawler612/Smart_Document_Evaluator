import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, HelpCircle, Minus, X } from 'lucide-react';

const STORAGE_KEY_PREFIX = 'sde_student_onboarding_v1';
const MASCOT_SRC = '/mascot/eva-welcome-nobg.png';

/**
 * Per-user storage key so every new Google account that lands on the portal sees Eva at least once,
 * even when several students share the same browser. Falls back to a single legacy key only when no
 * user id is available (e.g. mid-boot before Supabase resolves the session).
 */
function storageKeyFor(userId: string | null | undefined): string {
  const id = (userId ?? '').trim();
  if (!id) return STORAGE_KEY_PREFIX;
  return `${STORAGE_KEY_PREFIX}:${id}`;
}

type Step = {
  title: string;
  body: string;
};

/** Tour copy is tailored to the student portal pages registered in `App.tsx`. */
const STEPS: Step[] = [
  {
    title: 'WELCOME TO SMART DOCS VALIDATOR!',
    body:
      "Hello, I am Eva and I am here to guide you through the student portal. " +
      "I will not be restrictive — feel free to skip ahead, or click my text to speed me up!",
  },
  {
    title: 'YOUR DASHBOARD',
    body:
      "This is your home base. From here you can see your latest grades, your upcoming deadlines, " +
      "and quick links into every page in the side menu.",
  },
  {
    title: 'TASK',
    body:
      "When your teacher posts work, open Submit Work in the side menu to read the brief and upload your task. " +
      "PDFs, Word documents, and images are all accepted — the AI evaluator reads them all.",
  },
  {
    title: 'MY SUBMISSIONS',
    body:
      "Track everything you have turned in under My Submissions. Each row tells you if it is " +
      "Under review, Graded, or Needs resubmission, plus the file you sent.",
  },
  {
    title: 'YOUR AI EVALUATION REPORT',
    body:
      "After your teacher publishes a grade, open the submission to see the full AI report — " +
      "rubric scores, an executive summary, page-by-page Before → After fixes, a visual & diagram " +
      "evaluation table, and verified-correct excerpts.",
  },
  {
    title: 'RATE US',
    body:
      "Loved it or hated it? Tap the maroon Rate us button at the bottom-right of any page to " +
      "open the Software Usability Feedback Survey. Your notes shape what we build next!",
  },
  {
    title: 'YOU ARE ALL SET!',
    body:
      "That is the whole tour. Click the small Help icon at the bottom-left any time you want me " +
      "back — happy submitting, and good luck with your documents!",
  },
];

/** Replay hook for external callers (e.g. a Settings button). */
export function resetStudentOnboarding(userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKeyFor(userId));
  } catch {
    /* ignore */
  }
}

function readSeen(userId: string | null | undefined): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(storageKeyFor(userId)) === 'done';
  } catch {
    return false;
  }
}

function markSeen(userId: string | null | undefined): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKeyFor(userId), 'done');
  } catch {
    /* quota / private mode */
  }
}

type Props = {
  /** Active student id. Each id keeps its own "seen" flag so new accounts start the tour fresh. */
  userId?: string | null;
};

export default function StudentOnboardingTour({ userId = null }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const timerRef = useRef<number | null>(null);

  /**
   * Show automatically the first time *this user* lands on the portal. Re-evaluates whenever the
   * signed-in account changes — so a brand new login on the same browser triggers Eva again.
   */
  useEffect(() => {
    if (!userId) return;
    if (!readSeen(userId)) {
      setStep(0);
      setTyped(0);
      setMinimized(false);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [userId]);

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step >= STEPS.length - 1;
  const fullyTyped = typed >= current.body.length;

  /** Typewriter — ~22ms per char, click body to fast-forward. */
  useEffect(() => {
    if (!open || minimized) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    setTyped(0);
    const target = current.body.length;
    timerRef.current = window.setInterval(() => {
      setTyped((n) => {
        if (n >= target) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          return target;
        }
        return n + 2;
      });
    }, 22);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, minimized, step, current.body]);

  /** Esc closes (and marks seen) for keyboard accessibility. */
  useEffect(() => {
    if (!open || minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, minimized]);

  const handleAdvance = useCallback(() => {
    if (!fullyTyped) {
      setTyped(current.body.length);
      return;
    }
    if (isLast) {
      markSeen(userId);
      setOpen(false);
      return;
    }
    setStep((s) => s + 1);
  }, [fullyTyped, isLast, current.body.length, userId]);

  const handleSkip = useCallback(() => {
    markSeen(userId);
    setOpen(false);
  }, [userId]);

  const handleClose = useCallback(() => {
    markSeen(userId);
    setOpen(false);
  }, [userId]);

  const handleReopenFromMini = useCallback(() => {
    setMinimized(false);
    setOpen(true);
  }, []);

  const handleReopenFromHelp = useCallback(() => {
    setStep(0);
    setMinimized(false);
    setOpen(true);
  }, []);

  const visibleBody = useMemo(
    () => current.body.slice(0, fullyTyped ? current.body.length : Math.max(1, typed)),
    [current.body, typed, fullyTyped]
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleReopenFromHelp}
        aria-label="Re-open guide tour"
        title="Re-open guide tour"
        className="fixed bottom-5 left-5 z-[55] inline-flex items-center gap-2 rounded-full border border-amber-300/90 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-950 shadow-md transition hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400/80"
      >
        <HelpCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        Tour
      </button>
    );
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={handleReopenFromMini}
        aria-label="Re-open Eva's guide"
        className="fixed bottom-5 left-5 z-[55] inline-flex items-center gap-1.5 rounded-full border border-amber-300/90 bg-white py-1 pl-1 pr-2.5 text-[11px] shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400/80"
      >
        <span className="flex h-12 w-12 items-end justify-center overflow-visible bg-transparent p-0">
          <img
            src={MASCOT_SRC}
            alt=""
            className="h-[3.25rem] w-[3.25rem] max-w-none object-contain object-bottom drop-shadow-[0_3px_12px_rgba(0,0,0,0.4)]"
          />
        </span>
        <span className="font-bold text-amber-950">Eva</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-start sm:bottom-3">
      <div className="pointer-events-auto relative mx-2 mb-2 flex w-full max-w-[min(100%,24rem)] items-end gap-2 sm:mx-3 sm:max-w-[min(100%,32rem)]">
        {/*
          `eva-welcome-nobg.png` is generated by `npm run mascot:strip-bg` (see scripts/remove-mascot-white-matte.mjs).
        */}
        {/* No frame — Eva floats on the page background; transparent PNG keeps her edges clean. */}
        <div className="relative -mb-1 hidden shrink-0 select-none items-end justify-center sm:flex sm:h-[15rem] sm:w-[9.5rem] md:h-[17rem] md:w-[11rem]">
          <img
            src={MASCOT_SRC}
            alt="Eva, the Smart Docs Validator guide"
            draggable={false}
            className="max-h-[122%] w-auto max-w-[min(100%,11rem)] object-contain object-bottom drop-shadow-[0_8px_22px_rgba(0,0,0,0.45)] md:max-w-[min(100%,12.5rem)]"
          />
        </div>

        <div className="relative ml-0 min-w-0 flex-1 sm:-ml-2">
          <span
            aria-hidden
            className="absolute -left-1.5 bottom-[4.75rem] hidden h-3 w-3 rotate-45 border-l-2 border-b-2 border-amber-400/90 bg-white sm:block md:bottom-[5.35rem]"
          />

          <div className="rounded-xl border-2 border-amber-400/90 bg-white p-3 shadow-xl sm:p-3.5">
            <div className="flex items-start gap-1.5">
              <div className="flex h-14 w-14 shrink-0 items-end justify-center overflow-visible bg-transparent sm:hidden">
                <img
                  src={MASCOT_SRC}
                  alt=""
                  className="h-[3.85rem] w-[3.85rem] max-w-none object-contain object-bottom drop-shadow-[0_3px_12px_rgba(0,0,0,0.4)]"
                />
              </div>
              <h2 className="min-w-0 flex-1 text-[13px] font-extrabold leading-tight tracking-wide text-amber-950 sm:text-sm">
                {current.title}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label="Minimize guide"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close guide"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdvance}
              className="mt-1.5 block w-full cursor-pointer rounded-lg bg-transparent p-0 text-left text-[13px] leading-relaxed text-slate-800 focus:outline-none sm:text-[13.5px]"
              aria-live="polite"
            >
              {visibleBody}
              {!fullyTyped ? <span className="ml-0.5 animate-pulse text-amber-600">▍</span> : null}
            </button>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <span>Eva</span>
                <span className="text-slate-300">•</span>
                <span className="truncate">{fullyTyped ? `Step ${step + 1} of ${STEPS.length}` : 'Click text to speed up'}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!isLast && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    Skip tour
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAdvance}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-950 shadow-sm transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/90"
                >
                  {!fullyTyped ? 'Skip type' : isLast ? 'Got it!' : 'Next'}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-1">
              {STEPS.map((_, i) => {
                const active = i === step;
                return (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      active ? 'w-5 bg-amber-500' : 'w-1 bg-amber-200'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

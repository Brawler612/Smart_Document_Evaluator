import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X, Send, CheckCircle2, MessageSquareHeart, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const STORAGE_KEY = 'sde_student_rate_us_v1';

/**
 * Public Google Form (short link) — opens in a new tab for any signed-in student.
 * Override at deploy time with `VITE_STUDENT_RATE_US_URL` if you publish a different form.
 */
const DEFAULT_RATE_URL = 'https://forms.gle/5uZtCTgv9WjatGvk7';

/** Final URL the pill opens — env override wins, otherwise the built-in form. Empty string = fall back to in-app modal. */
const EXTERNAL_RATE_URL =
  (import.meta.env.VITE_STUDENT_RATE_US_URL as string | undefined)?.trim() || DEFAULT_RATE_URL;

type StoredRating = {
  v: 1;
  rating: number;
  comment: string;
  submittedAt: string;
  userId?: string;
  userEmail?: string;
};

function readStoredRating(): StoredRating | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRating;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredRating(value: StoredRating): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Floating "Rate us" button + modal. Mounts at the bottom-right of the student portal only;
 * the parent (Layout) guards on `user.role === 'student'` so this never renders for staff.
 * Submissions are kept client-side in localStorage so the feature ships without a new DB table.
 */
export default function StudentRateUsButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const prior = useMemo(() => readStoredRating(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function openDialog() {
    if (EXTERNAL_RATE_URL) {
      window.open(EXTERNAL_RATE_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    if (prior && !submitted) {
      setRating(prior.rating);
      setComment(prior.comment);
    }
    setSubmitted(false);
    setOpen(true);
  }

  function handleSubmit() {
    if (rating < 1) return;
    const payload: StoredRating = {
      v: 1,
      rating,
      comment: comment.trim().slice(0, 1000),
      submittedAt: new Date().toISOString(),
      userId: user?.id,
      userEmail: user?.email,
    };
    writeStoredRating(payload);
    setSubmitted(true);
  }

  const ratingHint =
    (hover || rating) >= 5
      ? 'Amazing — thank you!'
      : (hover || rating) >= 4
        ? 'Glad it is working well.'
        : (hover || rating) >= 3
          ? 'Thanks — tell us what to improve.'
          : (hover || rating) >= 2
            ? 'Sorry — what went wrong?'
            : (hover || rating) >= 1
              ? 'Sorry — please share details below.'
              : 'Tap a star to rate.';

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={EXTERNAL_RATE_URL ? 'Open Smart Docs Validator feedback survey' : 'Rate Smart Docs Validator'}
        title={EXTERNAL_RATE_URL ? 'Open the usability feedback survey' : 'Rate Smart Docs Validator'}
        className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-2 rounded-full border border-[#84001B]/25 bg-[#84001B] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#84001B]/25 transition hover:bg-[#6b0016] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#ffd21a] focus:ring-offset-2"
      >
        <Star className="h-4 w-4 fill-[#ffd21a] text-[#ffd21a]" aria-hidden />
        Rate us
        {EXTERNAL_RATE_URL ? <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden /> : null}
      </button>

      {open && !EXTERNAL_RATE_URL &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rate-us-title"
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close rate us dialog"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#84001B]"
              >
                <X className="h-5 w-5" />
              </button>

              {!submitted ? (
                <div className="px-6 py-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#84001B]/10 text-[#84001B]">
                      <MessageSquareHeart className="h-6 w-6" aria-hidden />
                    </div>
                    <div>
                      <h2 id="rate-us-title" className="text-lg font-bold text-slate-900">
                        How is Smart Docs Validator?
                      </h2>
                      <p className="text-xs text-slate-500">
                        Your feedback helps us improve the AI evaluator and student workflow.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div
                      className="flex items-center justify-center gap-2"
                      onMouseLeave={() => setHover(0)}
                    >
                      {[1, 2, 3, 4, 5].map((n) => {
                        const active = (hover || rating) >= n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRating(n)}
                            onMouseEnter={() => setHover(n)}
                            onFocus={() => setHover(n)}
                            onBlur={() => setHover(0)}
                            aria-label={`${n} star${n === 1 ? '' : 's'}`}
                            className="rounded-full p-1 transition focus:outline-none focus:ring-2 focus:ring-[#ffd21a]"
                          >
                            <Star
                              className={`h-9 w-9 transition ${
                                active
                                  ? 'fill-[#ffd21a] text-[#ffd21a] drop-shadow-sm'
                                  : 'text-slate-300'
                              }`}
                              aria-hidden
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-slate-600">
                      {ratingHint}
                    </p>
                  </div>

                  <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Optional comment
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                    rows={4}
                    placeholder="What did you like? What should we improve? (max 1000 chars)"
                    className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#84001B] focus:outline-none focus:ring-2 focus:ring-[#84001B]/20"
                  />
                  <div className="mt-1 text-right text-[11px] text-slate-400">
                    {comment.length}/1000
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Maybe later
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={rating < 1}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#6b0016] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" aria-hidden />
                      Submit feedback
                    </button>
                  </div>

                  {prior ? (
                    <p className="mt-3 text-center text-[11px] text-slate-400">
                      You last rated us {prior.rating}/5 on{' '}
                      {new Date(prior.submittedAt).toLocaleDateString()}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-8 w-8" aria-hidden />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">Thanks for the feedback!</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    You rated us <span className="font-bold text-[#84001B]">{rating}/5</span>. We will use
                    your notes to keep improving the AI evaluator and grading flow.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-5 rounded-xl bg-[#84001B] px-4 py-2 text-sm font-bold text-white hover:bg-[#6b0016]"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

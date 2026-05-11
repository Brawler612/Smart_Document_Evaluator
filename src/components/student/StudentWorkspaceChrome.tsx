import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shared maroon-tinted page background used across the student portal pages. */
export function StudentWorkspaceShell({
  children,
  maxWidthClass = 'max-w-7xl',
}: {
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="min-h-full bg-gradient-to-b from-[#fff8f9] via-slate-50 to-white">
      <div className={`p-6 md:p-8 ${maxWidthClass} mx-auto pb-16 w-full`}>{children}</div>
    </div>
  );
}

/** Hero header used on the new student dashboard / workspace pages. */
export function StudentPageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  kpis,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  kpis?: { label: string; value: ReactNode; accent?: 'white' | 'yellow' }[];
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#84001B]/25 bg-gradient-to-br from-[#84001B] via-[#84001B] to-[#5c0014] p-5 md:p-7 text-white shadow-xl shadow-[#84001B]/15 mb-6">
      <div
        className="absolute -top-16 -right-12 w-56 h-56 rounded-full bg-[#ffd21a]/25 blur-3xl pointer-events-none"
        aria-hidden
      />
      <div className="absolute -bottom-12 -left-10 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd21a]">{eyebrow}</p>
          <h1 className="text-2xl md:text-[28px] font-bold mt-2 leading-tight flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 text-[#ffd21a] shrink-0 backdrop-blur-sm border border-white/15 shadow-inner">
              <Icon className="w-[22px] h-[22px]" aria-hidden />
            </span>
            <span>{title}</span>
          </h1>
          {description ? (
            <div className="mt-2 max-w-md text-sm leading-relaxed text-white/85">{description}</div>
          ) : null}
        </div>
        {kpis && kpis.length > 0 ? (
          <dl className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0 md:min-w-[300px]">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-3 text-center"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{kpi.label}</dt>
                <dd
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    kpi.accent === 'yellow' ? 'text-[#ffd21a]' : 'text-white'
                  }`}
                >
                  {kpi.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

export const studentCardClasses = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

/** Tone classes for SubStatus badges across the student workspace. */
export const studentStatusBadge: Record<string, string> = {
  submitted: 'bg-rose-100 text-[#84001B] border border-rose-200/80',
  under_review: 'bg-[#ffd21a]/25 text-[#5c0014] border border-[#ffd21a]/45',
  reviewed: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  resubmit: 'bg-red-50 text-red-800 border border-red-100',
};

export function StudentStatusPill({ status }: { status: string }) {
  const cls = studentStatusBadge[status] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
  const label =
    status === 'reviewed'
      ? 'Graded'
      : status === 'under_review'
      ? 'Under review'
      : status === 'resubmit'
      ? 'Redo requested'
      : status === 'submitted'
      ? 'Submitted'
      : status.replace(/_/g, ' ');
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${cls}`}>{label}</span>
  );
}

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

/** Matches class list spreadsheet header row. Use on `<tr className={...}>`. */
export const teacherMaroonTheadClasses =
  'border-b border-[#5c0013] bg-[#84001B] text-[11px] font-semibold uppercase tracking-[0.06em] text-white shadow-sm';

/** White card + amber tip pattern for directory-style blocks. */
export const teacherRoundedTableShell = 'rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden';

/** Page background used across teacher workspace routes. */
export function TeacherWorkspaceShell({
  children,
  maxWidthClass = 'max-w-7xl',
}: {
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className={`p-6 md:p-8 ${maxWidthClass} mx-auto pb-16 w-full`}>{children}</div>
    </div>
  );
}

export function TeacherPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">{eyebrow}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0 shadow-lg shadow-[#84001B]/20">
              <Icon className="w-[22px] h-[22px]" aria-hidden />
            </span>
            <span>{title}</span>
          </h1>
          {description ? <div className="text-slate-600 text-sm mt-2 max-w-2xl leading-relaxed">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

export function TeacherSearchSurface({
  value,
  onChange,
  placeholder,
  disabled,
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-sm shadow-sm p-4 sm:p-5 mb-6">
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
          aria-hidden
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]/40 bg-white"
        />
      </div>
      {footer}
    </div>
  );
}

export function TeacherAmberCue({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-2.5 md:px-5 text-[12px] text-slate-800 bg-amber-50/80 border-b border-amber-100/90 leading-relaxed">
      {title ? <span className="font-semibold text-amber-950">{title}</span> : null}
      {title && children ? ' ' : null}
      {children}
    </div>
  );
}

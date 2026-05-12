import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Mail, UsersRound } from 'lucide-react';
import {
  TeacherAmberCue,
  TeacherPageHeader,
  TeacherSearchSurface,
  TeacherWorkspaceShell,
  teacherMaroonTheadClasses,
  teacherRoundedTableShell,
} from '../../components/teacher/TeacherWorkspaceChrome';
import { TEAM_14 } from '../../data/team14';

export default function Team14() {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TEAM_14;
    return TEAM_14.filter((m) => {
      const hay = [m.fullName, m.studentId, m.courseYear, m.citEmail, m.gmail].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [q]);

  return (
    <TeacherWorkspaceShell>
      <TeacherPageHeader
        eyebrow="Teams"
        title="Team 14"
        icon={UsersRound}
        actions={
          <>
            <Link
              to="/class-list"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Class list
              <ChevronRight className="w-3.5 h-3.5 opacity-70" aria-hidden />
            </Link>
            <Link
              to="/grading"
              className="inline-flex items-center gap-2 rounded-xl bg-[#84001B] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-[#84001B]/20 hover:bg-[#6b0016]"
            >
              Grading workspace
              <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </>
        }
      />

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overview</h2>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-7 shadow-sm border-l-[4px] border-l-[#ffd21a] flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[#ffd21a] text-[#84001B] flex items-center justify-center shrink-0 shadow-inner">
            <UsersRound className="w-8 h-8" aria-hidden />
          </div>
          <div>
            <p className="text-4xl font-bold text-slate-900 tabular-nums leading-none">{TEAM_14.length}</p>
            <p className="text-sm font-semibold text-slate-800 mt-2">Members on Team 14</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Search filters this table instantly — scroll sideways if needed.</p>
          </div>
        </div>
      </section>

      <TeacherSearchSurface
        value={q}
        onChange={setQ}
        placeholder="Search name, student ID, course, emails…"
        footer={
          <p className="text-[11px] text-slate-500 mt-3">
            Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {TEAM_14.length} member
            {TEAM_14.length !== 1 ? 's' : ''}
            {q.trim() ? (
              <>
                {' '}
                matching &quot;<span className="text-slate-700">{q.trim()}</span>&quot;
              </>
            ) : null}
          </p>
        }
      />

      <div className={teacherRoundedTableShell}>
        <TeacherAmberCue title="Team roster">
          Same maroon spreadsheet header pattern as Class list — student first, identifiers and mail columns to the right.
        </TeacherAmberCue>
        <div className="max-h-[min(520px,70vh)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] text-[13px] leading-snug">
            <thead>
              <tr className={teacherMaroonTheadClasses}>
                <th className="px-4 py-3.5 whitespace-nowrap">Student name</th>
                <th className="px-3 py-3.5 text-center whitespace-nowrap">Student ID</th>
                <th className="px-3 py-3.5 whitespace-nowrap">Course &amp; year</th>
                <th className="px-3 py-3.5 min-w-[10rem]">CIT email</th>
                <th className="px-4 py-3.5 min-w-[10rem]">Gmail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.studentId} className="bg-white hover:bg-[#fff8f9] transition-colors align-middle">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffd21a] to-[#f5c400] text-[#84001B] flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm">
                        {m.fullName
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900 truncate">{m.fullName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[11px] font-mono text-center text-slate-800">{m.studentId}</td>
                  <td className="px-3 py-3 text-slate-800 font-medium">{m.courseYear}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-start gap-1.5 min-w-0 text-slate-700">
                      <Mail className="w-4 h-4 text-[#84001B]/50 shrink-0 mt-0.5" aria-hidden />
                      <a href={`mailto:${m.citEmail}`} className="text-[#84001B] font-medium hover:underline truncate">
                        {m.citEmail}
                      </a>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${m.gmail}`} className="text-slate-700 hover:text-[#84001B] hover:underline break-all">
                      {m.gmail}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-10 px-4">No members match that search.</p>
        )}
      </div>
    </TeacherWorkspaceShell>
  );
}

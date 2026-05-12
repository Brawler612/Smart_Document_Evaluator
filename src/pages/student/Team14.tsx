import { useMemo, useState } from 'react';
import { Mail, Search, UsersRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TEAM_14 } from '../../data/team14';

export default function StudentTeam14() {
  const { user } = useAuth();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TEAM_14;
    return TEAM_14.filter((m) => {
      const hay = [m.fullName, m.studentId, m.courseYear, m.citEmail, m.gmail].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [q]);

  const myEmail = user?.email?.toLowerCase() ?? '';
  const myName = user?.full_name?.toLowerCase() ?? '';

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#84001B]/80">Teams</div>
      <div className="mb-7 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#84001B] text-white flex items-center justify-center shadow-sm">
          <UsersRound className="w-5 h-5" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Team 14</h1>
      </div>

      <section className="mb-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 md:p-6 shadow-sm border-l-[4px] border-l-[#ffd21a] flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#ffd21a] text-[#84001B] flex items-center justify-center shrink-0">
            <UsersRound className="w-6 h-6" aria-hidden />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{TEAM_14.length}</p>
            <p className="text-sm font-semibold text-gray-800 mt-2">Members on Team 14</p>
            <p className="text-xs text-gray-400 mt-1">Your group roster — search by name, ID, course, or email.</p>
          </div>
        </div>
      </section>

      <div className="mb-3 relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, student ID, course, emails…"
          className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:border-[#84001B] focus:outline-none focus:ring-2 focus:ring-[#84001B]/15"
        />
      </div>
      <p className="mb-4 text-[11px] text-gray-500">
        Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {TEAM_14.length} member
        {TEAM_14.length !== 1 ? 's' : ''}
        {q.trim() ? (
          <>
            {' '}matching &quot;<span className="text-gray-700">{q.trim()}</span>&quot;
          </>
        ) : null}
      </p>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-[#fffaf5] border-b border-[#ffd21a]/40">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#84001B]">Team roster</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Same maroon header pattern as the teacher view — your row is highlighted.</p>
        </div>
        <div className="max-h-[min(520px,70vh)] overflow-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[13px] leading-snug">
            <thead>
              <tr className="bg-[#84001B] text-white text-[11px] font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Student name</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Student ID</th>
                <th className="px-3 py-3 whitespace-nowrap">Course &amp; year</th>
                <th className="px-3 py-3 min-w-[10rem]">CIT email</th>
                <th className="px-4 py-3 min-w-[10rem]">Gmail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((m) => {
                const isMe =
                  (myEmail && (m.citEmail.toLowerCase() === myEmail || m.gmail.toLowerCase() === myEmail)) ||
                  (myName && m.fullName.toLowerCase() === myName);
                return (
                  <tr
                    key={m.studentId}
                    className={`align-middle transition-colors ${isMe ? 'bg-[#fff7e0]' : 'bg-white hover:bg-[#fff8f9]'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ffd21a] to-[#f5c400] text-[#84001B] flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm">
                          {m.fullName
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{m.fullName}</p>
                          {isMe && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#84001B] text-white">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] font-mono text-center text-gray-800">{m.studentId}</td>
                    <td className="px-3 py-3 text-gray-800 font-medium">{m.courseYear}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-start gap-1.5 min-w-0 text-gray-700">
                        <Mail className="w-4 h-4 text-[#84001B]/50 shrink-0 mt-0.5" aria-hidden />
                        <a href={`mailto:${m.citEmail}`} className="text-[#84001B] font-medium hover:underline truncate">
                          {m.citEmail}
                        </a>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`mailto:${m.gmail}`} className="text-gray-700 hover:text-[#84001B] hover:underline break-all">
                        {m.gmail}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-10 px-4">No members match that search.</p>
        )}
      </div>
    </div>
  );
}

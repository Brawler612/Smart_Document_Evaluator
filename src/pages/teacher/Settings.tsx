import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Bell,
  Users,
  ClipboardList,
  ChevronRight,
  BarChart3,
  Inbox,
  FileText,
  Settings as SettingsIcon,
} from 'lucide-react';
import { TeacherWorkspaceShell, TeacherPageHeader } from '../../components/teacher/TeacherWorkspaceChrome';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function TeacherSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [studentCount, setStudentCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingCounts(true);
      const students = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student');
      const pendingPlural = await supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');
      const pending = pendingPlural.error
        ? await supabase
            .from('submission')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'submitted')
        : pendingPlural;
      setStudentCount(students.count || 0);
      setPendingCount(pending.count || 0);
      setLoadingCounts(false);
    })();
  }, []);

  const shortcuts = [
    {
      label: 'Submission roster',
      hint: 'Browse and filter every upload',
      Icon: FileText,
      to: '/student-submissions',
      iconClass: 'bg-[#84001B]/10 text-[#84001B]',
    },
    {
      label: 'Inbox',
      hint: 'See what still needs attention',
      Icon: Inbox,
      to: '/inbox',
      iconClass: 'bg-[#ffd21a]/30 text-[#84001B]',
    },
    {
      label: 'Grading workspace',
      hint: 'Score, feedback, and AI checks',
      Icon: ClipboardList,
      to: '/grading',
      iconClass: 'bg-[#84001B] text-[#ffd21a]',
    },
    {
      label: 'Reports',
      hint: 'Throughput, scores, and breakdowns',
      Icon: BarChart3,
      to: '/reports',
      iconClass: 'bg-red-50 text-[#84001B]',
    },
    {
      label: 'Class list',
      hint: 'Manage enrolled students',
      Icon: Users,
      to: '/class-list',
      iconClass: 'bg-[#84001B]/10 text-[#84001B]',
    },
  ];

  return (
    <TeacherWorkspaceShell maxWidthClass="max-w-4xl">
      <TeacherPageHeader
        eyebrow="Settings"
        title="Teacher workspace"
        icon={SettingsIcon}
        description="Your signed-in profile, a quick read on backlog, and shortcuts into the tools you use every day—same shell and maroon accent as Class list."
      />

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Account</h2>
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden border-l-[4px] border-l-[#ffd21a]">
            <div className="p-6 md:p-7 flex flex-col sm:flex-row gap-6 sm:items-center">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#84001B] to-[#5c0014] text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-lg shadow-[#84001B]/25">
                  {(user?.full_name || user?.email || '?').trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Signed in</p>
                  <p className="text-lg font-bold text-slate-900 truncate">{user?.full_name || 'Teacher'}</p>
                  <p className="text-sm text-slate-500 truncate">{user?.email ?? '—'}</p>
                  <span className="inline-flex mt-2 text-[10px] font-bold uppercase tracking-wide text-[#84001B] bg-[#ffd21a]/35 border border-[#ffd21a]/50 rounded-full px-2.5 py-0.5">
                    {user?.role === 'admin' ? 'Admin' : 'Teacher'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:border-l sm:border-slate-100 sm:pl-7 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-[#84001B]/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-[#84001B]" aria-hidden />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Security</p>
                  <p className="text-sm font-semibold text-slate-800">Signed-in session active</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Use Logout in the sidebar to end your session</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Backlog</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm flex gap-4 border-l-[4px] border-l-[#ffd21a]/90">
              <div className="w-12 h-12 rounded-xl bg-[#ffd21a]/35 flex items-center justify-center shrink-0">
                <Bell className="w-6 h-6 text-[#84001B]" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">Awaiting first look</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
                  {loadingCounts ? '—' : pendingCount}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Submissions in <span className="font-semibold text-[#84001B]">submitted</span> status
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm flex gap-4 border-l-[4px] border-l-[#84001B]/35">
              <div className="w-12 h-12 rounded-xl bg-[#84001B]/10 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6 text-[#84001B]" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">Students on file</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
                  {loadingCounts ? '—' : studentCount}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/class-list')}
                  className="text-xs font-semibold text-[#84001B] hover:underline mt-1.5 inline-flex items-center gap-0.5"
                >
                  Open class list
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Shortcuts</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {shortcuts.map(({ label, hint, Icon, to, iconClass }) => (
              <Link
                key={to}
                to={to}
                className="group flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hover:border-[#84001B]/25 hover:shadow-md hover:bg-red-50/[0.35] transition-all"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
                  <Icon className="w-5 h-5" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 group-hover:text-[#84001B] transition-colors">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#84001B] shrink-0 mt-0.5 transition-colors" />
              </Link>
            ))}
          </div>
        </section>

        <p className="text-center text-[11px] text-slate-400 mt-12">
          Smart Docs Validator · Teacher workspace · Data from your live Supabase project
        </p>
    </TeacherWorkspaceShell>
  );
}

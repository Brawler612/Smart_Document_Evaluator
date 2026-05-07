import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, CheckSquare, Users, FileText, Clock, ChevronRight, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ assignments: 0, pending: 0, students: 0, docs: 0 });
  const [pendingSubs, setPendingSubs] = useState<{ id: string; file_name: string; status: string; submitted_at: string }[]>([]);
  const [activeAsgn, setActiveAsgn] = useState<{ id: string; title: string; document_type: string; due_date: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, s, u, d] = await Promise.all([
        supabase.from('assignments').select('id,title,document_type,due_date,status', { count: 'exact' }).eq('teacher_id', user!.id),
        supabase.from('submissions').select('id,file_name,status,submitted_at', { count: 'exact' }).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(5),
        supabase.from('users').select('id', { count: 'exact' }).eq('role', 'student'),
        supabase.from('documents').select('id', { count: 'exact' }),
      ]);
      setStats({ assignments: a.count || 0, pending: s.count || 0, students: u.count || 0, docs: d.count || 0 });
      setPendingSubs(s.data || []);
      setActiveAsgn(((a.data || []) as typeof activeAsgn).filter(x => x.due_date).sort((x, y) => new Date(x.due_date!).getTime() - new Date(y.due_date!).getTime()).slice(0, 4));
      setLoading(false);
    })();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const SC: Record<string, string> = { submitted: 'bg-blue-100 text-blue-700', under_review: 'bg-amber-100 text-amber-700', reviewed: 'bg-green-100 text-green-700', resubmit: 'bg-red-100 text-red-700' };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {user?.full_name?.split(' ')[0]}!</h1>
        <p className="text-gray-400 text-sm">Here's what's happening in your workspace today.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Assignments', value: stats.assignments, Icon: ClipboardList, bg: 'bg-[#84001B]', link: '/assignments' },
          { label: 'Pending Reviews', value: stats.pending, Icon: CheckSquare, bg: 'bg-amber-500', link: '/review-queue' },
          { label: 'Students', value: stats.students, Icon: Users, bg: 'bg-blue-600', link: '/users' },
          { label: 'Documents', value: stats.docs, Icon: FileText, bg: 'bg-emerald-600', link: '/documents' },
        ].map(({ label, value, Icon, bg, link }) => (
          <Link key={label} to={link}>
            <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200">
              <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center text-white mb-4`}><Icon className="w-6 h-6" /></div>
              <p className="text-2xl font-bold text-gray-900">{loading ? '—' : value}</p>
              <p className="text-sm text-gray-400 mt-0.5">{label}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">Pending Reviews</h2>
            <Link to="/review-queue" className="text-sm text-[#84001B] hover:underline flex items-center gap-1 font-medium">View all <ChevronRight className="w-3 h-3" /></Link>
          </div>
          {loading ? <Sk /> : pendingSubs.length === 0 ? <Em icon={<CheckSquare className="w-8 h-8" />} text="No pending reviews" /> : (
            <div className="space-y-2">
              {pendingSubs.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-[#84001B]/10 rounded-lg flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-[#84001B]" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.file_name}</p>
                    <p className="text-xs text-gray-400">{new Date(s.submitted_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${SC[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">Active Assignments</h2>
            <Link to="/assignments" className="text-sm text-[#84001B] hover:underline flex items-center gap-1 font-medium">View all <ChevronRight className="w-3 h-3" /></Link>
          </div>
          {loading ? <Sk /> : activeAsgn.length === 0 ? <Em icon={<ClipboardList className="w-8 h-8" />} text="No active assignments" /> : (
            <div className="space-y-2">
              {activeAsgn.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-[#ffd21a]/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#84001B]">{a.document_type}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : 'No due date'}</p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-gray-200 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Sk() { return <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>; }
function Em({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="flex flex-col items-center justify-center py-10 text-gray-300"><div className="mb-2">{icon}</div><p className="text-sm text-gray-400">{text}</p></div>; }

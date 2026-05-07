import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, FileText, CheckCircle, Clock, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import UserBadge from '../../components/UserBadge';

interface Stats {
  totalAssignments: number;
  activeAssignments: number;
  totalSubmissions: number;
  pendingReviews: number;
  reviewedSubmissions: number;
  avgScore: number;
  totalStudents: number;
  resubmitCount: number;
}

interface DocTypeStat { type: string; count: number; }
interface RecentSub { file_name: string; score: number | null; submitted_at: string; users: { full_name: string } | null; }

export default function Analytics() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalAssignments: 0, activeAssignments: 0, totalSubmissions: 0, pendingReviews: 0, reviewedSubmissions: 0, avgScore: 0, totalStudents: 0, resubmitCount: 0 });
  const [docTypeStats, setDocTypeStats] = useState<DocTypeStat[]>([]);
  const [recentSubs, setRecentSubs] = useState<RecentSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [asgn, subs, students, scored] = await Promise.all([
        supabase.from('assignments').select('id, status, document_type').eq('teacher_id', user!.id),
        supabase.from('submissions').select('id, status, score, submitted_at, file_name, users(full_name)').order('submitted_at', { ascending: false }),
        supabase.from('users').select('id', { count: 'exact' }).eq('role', 'student'),
        supabase.from('submissions').select('score').eq('status', 'reviewed').not('score', 'is', null),
      ]);

      const asgnData = asgn.data || [];
      const subsData = (subs.data || []) as (typeof subs.data & RecentSub[]);
      const scoredData = scored.data || [];

      const avgScore = scoredData.length > 0
        ? Math.round(scoredData.reduce((s: number, r: { score: number | null }) => s + (r.score || 0), 0) / scoredData.length)
        : 0;

      const typeCount: Record<string, number> = {};
      asgnData.forEach(a => { typeCount[a.document_type] = (typeCount[a.document_type] || 0) + 1; });

      setStats({
        totalAssignments: asgnData.length,
        activeAssignments: asgnData.filter(a => a.status === 'active').length,
        totalSubmissions: (subsData as { id: string }[]).length,
        pendingReviews: (subsData as { status: string }[]).filter(s => s.status === 'submitted').length,
        reviewedSubmissions: (subsData as { status: string }[]).filter(s => s.status === 'reviewed').length,
        resubmitCount: (subsData as { status: string }[]).filter(s => s.status === 'resubmit').length,
        avgScore,
        totalStudents: students.count || 0,
      });
      setDocTypeStats(Object.entries(typeCount).map(([type, count]) => ({ type, count })));
      setRecentSubs((subsData as RecentSub[]).slice(0, 8));
      setLoading(false);
    })();
  }, [user]);

  const maxDocCount = Math.max(...docTypeStats.map(d => d.count), 1);
  const reviewRate = stats.totalSubmissions > 0 ? Math.round((stats.reviewedSubmissions / stats.totalSubmissions) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between sticky top-0 bg-white z-10 pt-6 pb-4 -mx-8 px-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-400 text-sm mt-0.5">Overview of assignments, submissions, and performance</p>
        </div>
        <UserBadge />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Assignments', value: stats.totalAssignments, Icon: BarChart3, color: 'bg-[#84001B]', sub: `${stats.activeAssignments} active` },
              { label: 'Total Submissions', value: stats.totalSubmissions, Icon: FileText, color: 'bg-blue-600', sub: `${stats.pendingReviews} pending` },
              { label: 'Avg Score', value: `${stats.avgScore}%`, Icon: Award, color: 'bg-amber-500', sub: `${stats.reviewedSubmissions} reviewed` },
              { label: 'Total Students', value: stats.totalStudents, Icon: Users, color: 'bg-emerald-600', sub: 'enrolled' },
              { label: 'Review Rate', value: `${reviewRate}%`, Icon: CheckCircle, color: 'bg-teal-600', sub: 'of submissions' },
              { label: 'Pending Reviews', value: stats.pendingReviews, Icon: Clock, color: 'bg-orange-500', sub: 'awaiting review' },
              { label: 'Resubmissions', value: stats.resubmitCount, Icon: TrendingUp, color: 'bg-red-600', sub: 'requested' },
              { label: 'Active Assignments', value: stats.activeAssignments, Icon: BarChart3, color: 'bg-[#84001B]/80', sub: 'currently open' },
            ].map(({ label, value, Icon, color, sub }) => (
              <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-all">
                <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white mb-3`}><Icon className="w-5 h-5" /></div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-sm text-gray-400 mt-0.5">{label}</p>
                <p className="text-xs text-gray-300 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-900 mb-5">Assignments by Document Type</h2>
              {docTypeStats.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-4">
                  {docTypeStats.map(({ type, count }) => (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-gray-700">{type}</span>
                        <span className="text-gray-400">{count} assignment{count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#84001B] rounded-full transition-all duration-700"
                          style={{ width: `${(count / maxDocCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-900 mb-5">Recent Submissions</h2>
              {recentSubs.length === 0 ? (
                <p className="text-gray-300 text-sm text-center py-8">No submissions yet</p>
              ) : (
                <div className="space-y-3">
                  {recentSubs.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.file_name}</p>
                        <p className="text-xs text-gray-400">{s.users?.full_name}</p>
                      </div>
                      {s.score != null ? (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.score >= 80 ? 'bg-green-100 text-green-700' : s.score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {s.score}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-900 mb-5">Submission Status Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Submitted', count: stats.pendingReviews, color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
                  { label: 'Under Review', count: stats.totalSubmissions - stats.pendingReviews - stats.reviewedSubmissions - stats.resubmitCount, color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700' },
                  { label: 'Reviewed', count: stats.reviewedSubmissions, color: 'bg-green-500', light: 'bg-green-50 text-green-700' },
                  { label: 'Resubmit', count: stats.resubmitCount, color: 'bg-red-500', light: 'bg-red-50 text-red-700' },
                ].map(({ label, count, color, light }) => (
                  <div key={label} className={`rounded-xl p-4 ${light}`}>
                    <p className="text-2xl font-bold">{Math.max(0, count)}</p>
                    <p className="text-sm font-medium mt-1">{label}</p>
                    <div className="h-1.5 bg-white/50 rounded-full mt-3 overflow-hidden">
                      <div className={`h-full ${color} rounded-full`}
                        style={{ width: stats.totalSubmissions > 0 ? `${(Math.max(0, count) / stats.totalSubmissions) * 100}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

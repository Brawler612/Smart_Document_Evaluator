import { useEffect, useState } from 'react';
import { Search, FileText, Star, MessageSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { SubStatus } from '../../types';
interface Submission {
  id: string;
  file_name: string;
  status: SubStatus;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  assignments: { title: string; document_type: string } | null;
}

const STATUS_COLORS: Record<SubStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
  resubmit: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<SubStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  reviewed: 'Reviewed',
  resubmit: 'Resubmit Required',
};

export default function MySubmissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('all');
  const [selected, setSelected] = useState<Submission | null>(null);

  async function load() {
    const { data } = await supabase
      .from('submissions')
      .select('*, assignments(title, document_type)')
      .eq('student_id', user!.id)
      .order('submitted_at', { ascending: false });
    setSubmissions((data || []) as Submission[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const filtered = submissions.filter(s =>
    (filter === 'all' || s.status === filter) &&
    (s.file_name.toLowerCase().includes(search.toLowerCase()) ||
      s.assignments?.title?.toLowerCase().includes(search.toLowerCase()) || false)
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Submissions</h1>
        <p className="text-gray-400 text-sm mt-0.5">Track all your submitted documents</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search submissions..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'submitted', 'under_review', 'reviewed', 'resubmit'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${filter === s ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s === 'all' ? 'All' : STATUS_LABELS[s as SubStatus]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <FileText className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No submissions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-[#84001B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{s.file_name}</p>
                      <p className="text-sm text-gray-400 truncate">{s.assignments?.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.score != null && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                          <Star className="w-3 h-3" />{s.score}%
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                      {(s.feedback || s.score != null) && (
                        <button onClick={() => setSelected(s)}
                          className="flex items-center gap-1 text-xs text-[#84001B] font-medium hover:underline">
                          <MessageSquare className="w-3.5 h-3.5" />Feedback
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-300 mt-1">{new Date(s.submitted_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Teacher Feedback</h2>
                <p className="text-sm text-gray-400 truncate">{selected.file_name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {selected.score != null && (
                <div className="flex items-center justify-between bg-amber-50 rounded-xl p-4">
                  <span className="text-sm font-semibold text-gray-700">Your Score</span>
                  <span className="text-2xl font-bold text-amber-600">{selected.score}%</span>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Status</p>
                <span className={`text-sm px-3 py-1.5 rounded-lg font-medium ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              {selected.feedback ? (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Comments</p>
                  <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 leading-relaxed">{selected.feedback}</div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No written feedback yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Search, FileText, CheckCircle, XCircle, Eye, X, Star, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SubStatus, DocType } from '../../types';

interface Submission {
  id: string;
  file_name: string;
  file_url: string | null;
  status: SubStatus;
  submitted_at: string;
  feedback: string | null;
  score: number | null;
  assignment_id: string;
  student_id: string;
  assignments: { title: string; document_type: DocType } | null;
  users: { full_name: string; email: string } | null;
}

interface AICriterion { name: string; score: number; max: number; comment: string; }

const STATUS_COLORS: Record<SubStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
  resubmit: 'bg-red-100 text-red-700',
};

function runAI(docType: string): AICriterion[] {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const base: Record<string, { name: string; max: number }[]> = {
    SRS: [
      { name: 'Completeness', max: 20 }, { name: 'Clarity', max: 20 },
      { name: 'Consistency', max: 20 }, { name: 'Feasibility', max: 20 }, { name: 'Verifiability', max: 20 },
    ],
    SDD: [
      { name: 'Architecture Design', max: 25 }, { name: 'Module Decomposition', max: 25 },
      { name: 'Interface Definitions', max: 25 }, { name: 'Data Design', max: 25 },
    ],
    SPMP: [
      { name: 'Project Organization', max: 20 }, { name: 'Schedule', max: 20 },
      { name: 'Risk Management', max: 20 }, { name: 'Resource Allocation', max: 20 }, { name: 'Quality Assurance', max: 20 },
    ],
  };
  const criteria = base[docType] || [
    { name: 'Content Quality', max: 25 }, { name: 'Organization', max: 25 },
    { name: 'Technical Accuracy', max: 25 }, { name: 'Completeness', max: 25 },
  ];
  const comments = ['Excellent work', 'Needs improvement', 'Good effort', 'Well structured', 'Lacks detail', 'Very thorough'];
  return criteria.map(c => ({ ...c, score: rand(Math.floor(c.max * 0.6), c.max), comment: comments[rand(0, comments.length - 1)] }));
}

export default function ReviewQueue() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SubStatus | 'all'>('submitted');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [aiCriteria, setAiCriteria] = useState<AICriterion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [newStatus, setNewStatus] = useState<SubStatus>('reviewed');
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('submissions')
      .select('*, assignments(title, document_type), users(full_name, email)')
      .order('submitted_at', { ascending: false });
    setSubmissions((data || []) as Submission[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function openReview(sub: Submission) {
    setSelected(sub);
    setFeedback(sub.feedback || '');
    setNewStatus(sub.status === 'submitted' || sub.status === 'under_review' ? 'reviewed' : sub.status);
    setAiCriteria([]);
    setAiLoading(true);
    await supabase.from('submissions').update({ status: 'under_review' }).eq('id', sub.id);
    setTimeout(() => {
      setAiCriteria(runAI(sub.assignments?.document_type || 'Other'));
      setAiLoading(false);
    }, 1800);
  }

  async function saveReview() {
    if (!selected) return;
    setSaving(true);
    const total = aiCriteria.reduce((s, c) => s + c.score, 0);
    const maxTotal = aiCriteria.reduce((s, c) => s + c.max, 0);
    const score = Math.round((total / maxTotal) * 100);
    await supabase.from('submissions').update({ status: newStatus, feedback, score }).eq('id', selected.id);
    setSaving(false);
    setSelected(null);
    load();
  }

  const filtered = submissions.filter(s =>
    (filter === 'all' || s.status === filter) &&
    (s.file_name.toLowerCase().includes(search.toLowerCase()) ||
      s.users?.full_name?.toLowerCase().includes(search.toLowerCase()) || false)
  );

  const totalScore = aiCriteria.reduce((s, c) => s + c.score, 0);
  const maxScore = aiCriteria.reduce((s, c) => s + c.max, 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-gray-400 text-sm mt-0.5">Review and grade student submissions</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by student or file..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'submitted', 'under_review', 'reviewed', 'resubmit'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors capitalize whitespace-nowrap ${filter === s ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <CheckCircle className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No submissions in this queue</p>
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
                      <p className="text-sm text-gray-400">{s.users?.full_name} · {s.assignments?.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.score != null && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                          <Star className="w-3 h-3" />{s.score}%
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                      <button onClick={() => openReview(s)}
                        className="flex items-center gap-1.5 bg-[#84001B] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#6b0016] transition-colors font-medium">
                        <Eye className="w-3.5 h-3.5" />Review
                      </button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-bold text-gray-900">Review Submission</h2>
                <p className="text-sm text-gray-400">{selected.users?.full_name} · {selected.file_name}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">AI Evaluation</h3>
                <p className="text-xs text-gray-400 mb-4">Automated scoring based on {selected.assignments?.document_type} criteria</p>
                {aiLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded-lg animate-pulse" />)}
                  </div>
                ) : (
                  <>
                    {aiCriteria.map(c => (
                      <div key={c.name} className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{c.name}</span>
                          <span className="text-gray-500">{c.score}/{c.max} — <span className="text-gray-400 text-xs">{c.comment}</span></span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-[#84001B] rounded-full transition-all duration-500" style={{ width: `${(c.score / c.max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    {aiCriteria.length > 0 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                        <span className="font-bold text-gray-700">Total Score</span>
                        <span className="text-xl font-bold text-[#84001B]">{Math.round((totalScore / maxScore) * 100)}%</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Teacher Feedback</label>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={4} placeholder="Write your feedback here..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-none" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Update Status</label>
                <div className="relative">
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value as SubStatus)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] appearance-none">
                    <option value="reviewed">Reviewed</option>
                    <option value="resubmit">Needs Resubmission</option>
                    <option value="under_review">Under Review</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSelected(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={saveReview} disabled={saving || aiLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                  <CheckCircle className="w-4 h-4" />{saving ? 'Saving...' : 'Save Review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

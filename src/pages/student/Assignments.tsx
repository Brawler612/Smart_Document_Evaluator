import { useEffect, useState } from 'react';
import { Search, ClipboardList, Upload, Calendar, X, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  due_date: string | null;
  status: string;
  submitted?: boolean;
}

const DOC_COLORS: Record<string, string> = {
  SRS: 'bg-blue-100 text-blue-700',
  SDD: 'bg-emerald-100 text-emerald-700',
  SPMP: 'bg-orange-100 text-orange-700',
  Other: 'bg-gray-100 text-gray-600',
};

export default function StudentAssignments() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [asgn, subs] = await Promise.all([
      supabase.from('assignments').select('*').eq('status', 'active').order('due_date', { ascending: true }),
      supabase.from('submissions').select('assignment_id').eq('student_id', user!.id),
    ]);
    const submittedIds = new Set((subs.data || []).map(s => s.assignment_id));
    const data = (asgn.data || []).map(a => ({ ...a, submitted: submittedIds.has(a.id) }));
    setAssignments(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitting || !fileName.trim()) return;
    setSaving(true);
    await supabase.from('submissions').insert({
      assignment_id: submitting.id,
      student_id: user!.id,
      file_name: fileName,
      status: 'submitted',
    });
    setSaving(false);
    setSubmitting(null);
    setFileName('');
    load();
  }

  const filtered = assignments.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.document_type.toLowerCase().includes(search.toLowerCase())
  );

  const upcoming = filtered.filter(a => !a.submitted);
  const submitted = filtered.filter(a => a.submitted);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <p className="text-gray-400 text-sm mt-0.5">View and submit your assignments</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">To Submit ({upcoming.length})</h2>
              <div className="space-y-3">
                {upcoming.map(a => (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-5 h-5 text-[#84001B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                            {a.description && <p className="text-sm text-gray-400 mt-0.5 truncate">{a.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DOC_COLORS[a.document_type]}`}>{a.document_type}</span>
                            <button onClick={() => { setSubmitting(a); setFileName(''); }}
                              className="flex items-center gap-1.5 bg-[#84001B] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#6b0016] transition-colors font-medium">
                              <Upload className="w-3.5 h-3.5" />Submit
                            </button>
                          </div>
                        </div>
                        {a.due_date && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-2">
                            <Calendar className="w-3.5 h-3.5" />Due {new Date(a.due_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {submitted.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Submitted ({submitted.length})</h2>
              <div className="space-y-3">
                {submitted.map(a => (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-5 opacity-75">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOC_COLORS[a.document_type]}`}>{a.document_type}</span>
                          <span className="text-xs text-green-600 font-medium">Submitted</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <ClipboardList className="w-12 h-12 mb-3" />
              <p className="text-gray-400 font-medium">No assignments found</p>
            </div>
          )}
        </>
      )}

      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Submit Assignment</h2>
                <p className="text-sm text-gray-400 truncate">{submitting.title}</p>
              </div>
              <button onClick={() => setSubmitting(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Document File Name</label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input required value={fileName} onChange={e => setFileName(e.target.value)}
                    placeholder="e.g. SRS_GroupAlpha_v1.pdf"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Enter the name of your document file</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSubmitting(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                  {saving ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

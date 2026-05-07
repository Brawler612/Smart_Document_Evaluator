import { useEffect, useState } from 'react';
import { Plus, Search, ClipboardList, Calendar, Tag, MoreVertical, X, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { DocType, AStatus } from '../../types';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  document_type: DocType;
  status: AStatus;
  due_date: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<AStatus, string> = {
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
  draft: 'bg-amber-100 text-amber-700',
};

const DOC_COLORS: Record<string, string> = {
  SRS: 'bg-blue-100 text-blue-700',
  SDD: 'bg-emerald-100 text-emerald-700',
  SPMP: 'bg-orange-100 text-orange-700',
  Other: 'bg-gray-100 text-gray-600',
};

export default function TeacherAssignments() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', document_type: 'SRS' as DocType, due_date: '', status: 'active' as AStatus });

  async function load() {
    const { data } = await supabase.from('assignments').select('*').eq('teacher_id', user!.id).order('created_at', { ascending: false });
    setAssignments(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('assignments').insert({ ...form, teacher_id: user!.id, due_date: form.due_date || null });
    setSaving(false);
    setShowModal(false);
    setForm({ title: '', description: '', document_type: 'SRS', due_date: '', status: 'active' });
    load();
  }

  async function updateStatus(id: string, status: AStatus) {
    await supabase.from('assignments').update({ status }).eq('id', id);
    setOpenMenu(null);
    load();
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Delete this assignment? This cannot be undone.')) return;
    await supabase.from('assignments').delete().eq('id', id);
    setOpenMenu(null);
    load();
  }

  const filtered = assignments.filter(a =>
    (filter === 'all' || a.status === filter) &&
    (a.title.toLowerCase().includes(search.toLowerCase()) || a.document_type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage and track all assignments</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors shadow-sm">
          <Plus className="w-4 h-4" />New Assignment
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'draft', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors capitalize ${filter === s ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <ClipboardList className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No assignments found</p>
          <p className="text-sm text-gray-300 mt-1">Create one to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#ffd21a]/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-[#84001B]">{a.document_type}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                      {a.description && <p className="text-sm text-gray-400 mt-0.5 truncate">{a.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[a.status]}`}>{a.status}</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DOC_COLORS[a.document_type]}`}>{a.document_type}</span>
                      <div className="relative">
                        <button onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenu === a.id && (
                          <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1 w-44">
                            {(['active', 'draft', 'closed'] as AStatus[]).filter(s => s !== a.status).map(s => (
                              <button key={s} onClick={() => updateStatus(a.id, s)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 capitalize">
                                Mark as {s}
                              </button>
                            ))}
                            <div className="border-t border-gray-100 my-1" />
                            <button onClick={() => deleteAssignment(a.id)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    {a.due_date && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Calendar className="w-3.5 h-3.5" />Due {new Date(a.due_date).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Tag className="w-3.5 h-3.5" />Created {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">New Assignment</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. SRS Document Sprint 1"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
                  <div className="relative">
                    <select value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value as DocType }))}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] appearance-none">
                      {['SRS', 'SDD', 'SPMP', 'Other'].map(t => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <div className="relative">
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AStatus }))}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] appearance-none capitalize">
                      {['active', 'draft', 'closed'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date (optional)</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                  {saving ? 'Creating...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openMenu && <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenu(null)} />}
    </div>
  );
}

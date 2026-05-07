import { useEffect, useState } from 'react';
import { Plus, Search, FolderOpen, Download, Trash2, FileText, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { DocType } from '../../types';
import Modal from '../../components/Modal';

interface Document {
  id: string;
  title: string;
  description: string | null;
  document_type: DocType;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  uploaded_by: string;
  users: { full_name: string } | null;
}

const DOC_COLORS: Record<string, string> = {
  SRS: 'bg-blue-100 text-blue-700',
  SDD: 'bg-emerald-100 text-emerald-700',
  SPMP: 'bg-orange-100 text-orange-700',
  Other: 'bg-gray-100 text-gray-600',
};

const PAGE_SIZE = 9;

export default function TeacherDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', document_type: 'SRS' as DocType });

  async function load() {
    const { data } = await supabase
      .from('documents')
      .select('*, users(full_name)')
      .order('created_at', { ascending: false });
    setDocuments((data || []) as Document[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('documents').insert({ ...form, uploaded_by: user!.id });
    setSaving(false);
    setShowModal(false);
    setForm({ title: '', description: '', document_type: 'SRS' });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return;
    await supabase.from('documents').delete().eq('id', id);
    load();
  }

  const filtered = documents.filter(d =>
    (typeFilter === 'all' || d.document_type === typeFilter) &&
    (d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.users?.full_name?.toLowerCase().includes(search.toLowerCase()) || false)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearchChange(val: string) { setSearch(val); setPage(1); }
  function handleFilterChange(val: DocType | 'all') { setTypeFilter(val); setPage(1); }

  return (
    <>
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-400 text-sm mt-0.5">Reference materials and templates</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2">
          {(['all', 'SRS', 'SDD', 'SPMP', 'Other'] as const).map(t => (
            <button key={t} onClick={() => handleFilterChange(t)}
              className={`px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${typeFilter === t ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-[#84001B] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#6b0016] transition-colors shadow-sm">
          <Plus className="w-3.5 h-3.5" />Upload Document
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <FolderOpen className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No documents found</p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(d => (
              <div key={d.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-gray-200 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-[#84001B]/10 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-[#84001B]" />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DOC_COLORS[d.document_type]}`}>{d.document_type}</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{d.title}</h3>
                {d.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{d.description}</p>}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400">{d.users?.full_name}</p>
                    <p className="text-xs text-gray-300">{new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-[#84001B] hover:bg-[#84001B]/10 rounded-lg transition-colors">
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => handleDelete(d.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${n === safePage ? 'bg-[#84001B] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">Upload Document</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Document title"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-none" />
              </div>
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
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                  {saving ? 'Saving...' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}

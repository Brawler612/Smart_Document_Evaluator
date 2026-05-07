import { useEffect, useState } from 'react';
import { Search, FolderOpen, Download, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DocType } from '../../types';
import UserBadge from '../../components/UserBadge';

interface Document {
  id: string;
  title: string;
  description: string | null;
  document_type: DocType;
  file_url: string | null;
  created_at: string;
  users: { full_name: string } | null;
}

const DOC_COLORS: Record<string, string> = {
  SRS: 'bg-blue-100 text-blue-700',
  SDD: 'bg-emerald-100 text-emerald-700',
  SPMP: 'bg-orange-100 text-orange-700',
  Other: 'bg-gray-100 text-gray-600',
};

export default function StudentDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType | 'all'>('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('documents').select('*, users(full_name)').order('created_at', { ascending: false });
      setDocuments((data || []) as Document[]);
      setLoading(false);
    })();
  }, []);

  const filtered = documents.filter(d =>
    (typeFilter === 'all' || d.document_type === typeFilter) &&
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between sticky top-0 bg-white z-10 pt-6 pb-4 -mx-8 px-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-400 text-sm mt-0.5">Reference materials and templates from your teacher</p>
        </div>
        <UserBadge />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'SRS', 'SDD', 'SPMP', 'Other'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${typeFilter === t ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <FolderOpen className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No documents available</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => (
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
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[#84001B] font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download className="w-3.5 h-3.5" />Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

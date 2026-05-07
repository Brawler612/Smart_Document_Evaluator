import { useEffect, useState } from 'react';
import { Plus, Search, Users, ChevronRight, X, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count?: number;
}

interface Student {
  id: string;
  full_name: string;
  email: string;
}

interface Member {
  user_id: string;
  users: { full_name: string; email: string } | null;
}

export default function GroupManagement() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [addingStudent, setAddingStudent] = useState('');

  async function load() {
    const { data } = await supabase.from('groups').select('*').eq('created_by', user!.id).order('created_at', { ascending: false });
    const groups = data || [];
    const withCounts = await Promise.all(groups.map(async g => {
      const { count } = await supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', g.id);
      return { ...g, member_count: count || 0 };
    }));
    setGroups(withCounts);
    setLoading(false);
  }

  async function loadStudents() {
    const { data } = await supabase.from('users').select('id, full_name, email').eq('role', 'student').order('full_name');
    setStudents(data || []);
  }

  useEffect(() => { load(); loadStudents(); }, [user]);

  async function openGroup(g: Group) {
    setSelectedGroup(g);
    const { data } = await supabase.from('group_members').select('user_id, users(full_name, email)').eq('group_id', g.id);
    setMembers((data || []) as Member[]);
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('groups').insert({ ...form, created_by: user!.id });
    setSaving(false);
    setShowCreate(false);
    setForm({ name: '', description: '' });
    load();
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return;
    await supabase.from('groups').delete().eq('id', id);
    load();
  }

  async function addMember() {
    if (!addingStudent || !selectedGroup) return;
    await supabase.from('group_members').upsert({ group_id: selectedGroup.id, user_id: addingStudent });
    setAddingStudent('');
    openGroup(selectedGroup);
    load();
  }

  async function removeMember(userId: string) {
    if (!selectedGroup) return;
    await supabase.from('group_members').delete().eq('group_id', selectedGroup.id).eq('user_id', userId);
    openGroup(selectedGroup);
    load();
  }

  const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  const memberIds = members.map(m => m.user_id);
  const availableStudents = students.filter(s => !memberIds.includes(s.id));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Group Management</h1>
          <p className="text-gray-400 text-sm mt-0.5">Organize students into groups</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors shadow-sm">
          <Plus className="w-4 h-4" />New Group
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No groups yet</p>
          <p className="text-sm text-gray-300 mt-1">Create a group to organize students</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(g => (
            <div key={g.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-gray-200 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-[#84001B]/10 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#84001B]" />
                </div>
                <button onClick={() => deleteGroup(g.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{g.name}</h3>
              {g.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{g.description}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                <span className="text-sm text-gray-400">{g.member_count} student{g.member_count !== 1 ? 's' : ''}</span>
                <button onClick={() => openGroup(g)}
                  className="flex items-center gap-1 text-sm font-medium text-[#84001B] hover:underline">
                  Manage <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">Create Group</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createGroup} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Group Name</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Group Alpha"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                  {saving ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <h2 className="font-bold text-gray-900">{selectedGroup.name}</h2>
                <p className="text-sm text-gray-400">{members.length} members</p>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              {availableStudents.length > 0 && (
                <div className="flex gap-2">
                  <select value={addingStudent} onChange={e => setAddingStudent(e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]">
                    <option value="">Select student to add...</option>
                    {availableStudents.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                  <button onClick={addMember} disabled={!addingStudent}
                    className="flex items-center gap-1.5 bg-[#84001B] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
                    <UserPlus className="w-4 h-4" />Add
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {members.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-6">No members yet</p>
                ) : members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-8 h-8 bg-[#ffd21a]/40 rounded-lg flex items-center justify-center flex-shrink-0 text-[#84001B] text-xs font-bold">
                      {m.users?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.users?.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.users?.email}</p>
                    </div>
                    <button onClick={() => removeMember(m.user_id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

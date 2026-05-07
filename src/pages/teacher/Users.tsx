import { useEffect, useState } from 'react';
import { Search, UserCheck, Shield, GraduationCap, Mail, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AppUser } from '../../types';

export default function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'teacher' | 'student'>('all');

  async function load() {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const teacherCount = users.filter(u => u.role === 'teacher').length;
  const studentCount = users.filter(u => u.role === 'student').length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-400 text-sm mt-0.5">View all registered users in the system</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Users', value: users.length, Icon: UserCheck, bg: 'bg-[#84001B]' },
          { label: 'Teachers', value: teacherCount, Icon: Shield, bg: 'bg-blue-600' },
          { label: 'Students', value: studentCount, Icon: GraduationCap, bg: 'bg-emerald-600' },
        ].map(({ label, value, Icon, bg }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-all">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center text-white mb-3`}><Icon className="w-5 h-5" /></div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : value}</p>
            <p className="text-sm text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
        </div>
        <div className="flex gap-2">
          {(['all', 'teacher', 'student'] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors capitalize ${roleFilter === r ? 'bg-[#84001B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <UserCheck className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">No users found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">Name</div>
            <div className="col-span-4">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Joined</div>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(u => (
              <div key={u.id} className="grid sm:grid-cols-12 gap-2 sm:gap-4 items-center px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="sm:col-span-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${u.role === 'teacher' ? 'bg-[#84001B] text-white' : 'bg-[#ffd21a]/40 text-[#84001B]'}`}>
                    {u.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900 text-sm truncate">{u.full_name}</span>
                </div>
                <div className="sm:col-span-4 flex items-center gap-1.5 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 hidden sm:block" />
                  <span className="truncate">{u.email}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${u.role === 'teacher' ? 'bg-[#84001B]/10 text-[#84001B]' : 'bg-[#ffd21a]/30 text-amber-800'}`}>
                    {u.role === 'teacher' ? <Shield className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
                    {u.role}
                  </span>
                </div>
                <div className="sm:col-span-2 flex items-center gap-1.5 text-xs text-gray-400">
                  <Calendar className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
                  {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
interface GroupMember {
  users: { full_name: string; email: string; role: string } | null;
}

interface MyGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  members: GroupMember[];
  teacher: { full_name: string } | null;
}

export default function MyGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id);

      const groupIds = (memberRows || []).map(r => r.group_id);
      if (groupIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase
        .from('groups')
        .select('*, teacher:users!teacher_id(full_name), members:group_members(users(full_name, email, role))')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      setGroups((data || []) as MyGroup[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Groups</h1>
        <p className="text-gray-400 text-sm mt-0.5">Groups you are a member of</p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-gray-400 font-medium">You are not in any groups</p>
          <p className="text-sm text-gray-300 mt-1">Your teacher will add you to a group</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {groups.map(g => (
            <div key={g.id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:border-gray-200 transition-all">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 bg-[#84001B]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-[#84001B]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{g.name}</h3>
                  {g.description && <p className="text-sm text-gray-400 mt-0.5">{g.description}</p>}
                  <p className="text-xs text-gray-300 mt-1">Created by {g.teacher?.full_name}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{g.members.length} Members</p>
                <div className="space-y-2">
                  {g.members.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${m.users?.role === 'teacher' ? 'bg-[#84001B] text-white' : 'bg-[#ffd21a]/40 text-[#84001B]'}`}>
                        {m.users?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                          {m.users?.full_name}
                          {m.users?.role === 'teacher' && (
                            <span className="text-[10px] bg-[#84001B]/10 text-[#84001B] px-1.5 py-0.5 rounded font-semibold">Teacher</span>
                          )}
                          {m.users?.email === user?.email && (
                            <span className="text-[10px] bg-[#ffd21a]/40 text-amber-800 px-1.5 py-0.5 rounded font-semibold">You</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{m.users?.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

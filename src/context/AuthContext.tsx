import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppUser } from '../types';

interface Ctx { session: Session | null; user: AppUser | null; loading: boolean; signOut: () => Promise<void>; }
const AuthContext = createContext<Ctx>({ session: null, user: null, loading: true, signOut: async () => {} });

async function fetchProfile(id: string): Promise<AppUser | null> {
  const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) setUser(await fetchProfile(s.user.id));
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        (async () => { setUser(await fetchProfile(s.user.id)); setLoading(false); })();
      } else { setUser(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() { await supabase.auth.signOut(); setSession(null); setUser(null); }
  return <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

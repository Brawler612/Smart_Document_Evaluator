import { useState } from 'react';
import { BookOpen, Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DEMO_ACCOUNTS } from '../types';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!email.endsWith('@cit.edu.ph')) { setError('Only @cit.edu.ph accounts are allowed.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError('Invalid email or password.'); setLoading(false); }
  }

  async function handleDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    setError(''); setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password });
    if (signInErr) {
      const { data: su } = await supabase.auth.signUp({ email: acc.email, password: acc.password, options: { data: { full_name: acc.full_name, role: acc.role } } });
      if (su.user) {
        await supabase.from('users').upsert({ id: su.user.id, email: acc.email, full_name: acc.full_name, role: acc.role });
        await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password });
      } else { setError('Could not load demo account.'); }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#84001B] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-white/[0.03] -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-white/[0.03] translate-y-1/2 -translate-x-1/2" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-[#ffd21a] rounded-2xl mb-4 shadow-2xl">
            <BookOpen className="w-10 h-10 text-[#84001B]" />
          </div>
          <h1 className="text-3xl font-bold text-white">Smart Document</h1>
          <h1 className="text-3xl font-bold text-[#ffd21a]">Evaluator</h1>
          <p className="text-white/50 text-xs mt-2 tracking-[0.2em] uppercase">CIT University LMS</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-6">Sign in with your university account</p>
          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">University Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="yourname@cit.edu.ph" required
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required
                  className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B] transition-all" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#84001B] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#6b0016] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Spinner />Signing in...</> : 'Sign In'}
            </button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">Demo Accounts</span></div>
          </div>
          <div className="space-y-3">
            {DEMO_ACCOUNTS.map(acc => (
              <button key={acc.email} onClick={() => handleDemo(acc)} disabled={loading}
                className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-3.5 hover:bg-gray-50 hover:border-[#84001B]/20 transition-all disabled:opacity-60 group text-left">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${acc.role === 'teacher' ? 'bg-[#84001B] text-white' : 'bg-[#ffd21a] text-[#84001B]'}`}>
                  {acc.role === 'teacher' ? 'T' : 'S'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-[#84001B] transition-colors truncate">{acc.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">{acc.email}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${acc.role === 'teacher' ? 'bg-[#84001B]/10 text-[#84001B]' : 'bg-[#ffd21a]/40 text-amber-800'}`}>
                  {acc.role === 'teacher' ? 'Teacher' : 'Student'}
                </span>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Only <span className="font-semibold text-gray-600">@cit.edu.ph</span> accounts are permitted</p>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DEMO_ACCOUNTS } from '../types';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="min-h-screen bg-[#6b0014] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[55%] h-[70%] rounded-3xl bg-[#84001B]/60 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[60%] rounded-full bg-[#9b0020]/40 blur-3xl" />
        <div className="absolute top-[30%] right-[15%] w-[30%] h-[40%] rounded-full bg-[#a80022]/30 blur-2xl" />
      </div>

      {/* Main two-column layout */}
      <div className="relative w-full max-w-5xl flex items-center gap-10">

        {/* Left panel */}
        <div className="flex-1 hidden md:block">
          {/* Label pill */}
          <div className="inline-block mb-10">
            <span className="text-[11px] tracking-[0.18em] uppercase text-[#e8c8a0] border border-[#e8c8a0]/40 rounded-full px-4 py-1.5 bg-white/5 backdrop-blur-sm">
              Smart Document Evaluator
            </span>
          </div>

          <h1 className="text-6xl font-extrabold leading-[1.08] mb-6">
            <span className="text-[#f5e6c8]">University</span>
            <br />
            <span className="text-[#ffd21a]">Access</span>
          </h1>

          <p className="text-white/55 text-base leading-relaxed max-w-[380px]">
            Sign in with your approved university Google account to access assignments, review student documents, and manage your workspace.
          </p>
        </div>

        {/* Right panel — login card */}
        <div className="w-full md:w-[420px] flex-shrink-0">
          <div className="bg-[#f7f3ee] rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-[#5a000f] mb-1">University Sign-In</h2>
            <p className="text-gray-500 text-sm mb-6">Use your <span className="font-medium text-gray-600">@cit.edu.ph</span> account to continue</p>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              </div>
            )}

            {/* Info box */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 text-sm text-gray-600 leading-relaxed">
              Access is limited to <span className="font-medium">@cit.edu.ph</span> accounts. Sign in using the demo credentials below to explore the platform.
            </div>

            {/* Google-style CTA (non-functional, just visual) */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl py-3 bg-white text-sm font-semibold text-gray-500 cursor-not-allowed opacity-60 mb-2"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <p className="text-center text-[11px] text-gray-400 mb-6">Google Sign-In is not configured for this demo</p>

            {/* Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center"><span className="bg-[#f7f3ee] px-3 text-xs text-gray-400">Or use a demo account</span></div>
            </div>

            {/* Demo account buttons */}
            <div className="space-y-3">
              {DEMO_ACCOUNTS.map(acc => (
                <button key={acc.email} onClick={() => handleDemo(acc)} disabled={loading}
                  className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-3.5 bg-white hover:border-[#84001B]/30 hover:bg-[#84001B]/[0.03] transition-all disabled:opacity-60 group text-left shadow-sm">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${acc.role === 'teacher' ? 'bg-[#84001B] text-white' : 'bg-[#ffd21a] text-[#84001B]'}`}>
                    {acc.role === 'teacher' ? 'T' : 'S'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-[#84001B] transition-colors truncate">{acc.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{acc.email}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${acc.role === 'teacher' ? 'bg-[#84001B]/10 text-[#84001B]' : 'bg-amber-100 text-amber-800'}`}>
                    {acc.role === 'teacher' ? 'Teacher' : 'Student'}
                  </span>
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 mt-5 text-sm text-gray-400">
                <Spinner /> Signing in...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Demo account badges — fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        <p className="text-[10px] text-white/40 text-right tracking-wide uppercase mb-0.5">Demo Accounts</p>
        {DEMO_ACCOUNTS.map(acc => (
          <button key={acc.email} onClick={() => handleDemo(acc)} disabled={loading}
            className="flex items-center gap-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 hover:bg-black/50 hover:border-white/20 transition-all disabled:opacity-50 text-left shadow-lg">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${acc.role === 'teacher' ? 'bg-[#84001B] text-white' : 'bg-[#ffd21a] text-[#84001B]'}`}>
              {acc.role === 'teacher' ? 'T' : 'S'}
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-white/90">{acc.full_name}</p>
              <p className="text-[10px] text-white/45">{acc.email}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getOAuthRedirectTo } from '../lib/oauthRedirect';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    if (!isSupabaseConfigured()) {
      setError(
        'Google sign-in needs a real Supabase project. In the project folder, create `.env` with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase → Project Settings → API, then restart the dev server (npm start).'
      );
      return;
    }
    setLoading(true);
    const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectTo(),
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setLoading(false);
      return;
    }
    if (data.url) window.location.href = data.url;
    else setLoading(false);
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
              Smart Docs Validator
            </span>
          </div>

          <h1 className="text-6xl font-extrabold leading-[1.08] mb-6">
            <span className="text-[#f5e6c8]">University</span>
            <br />
            <span className="text-[#ffd21a]">Access</span>
          </h1>

          <p className="text-white/55 text-base leading-relaxed max-w-[380px]">
            Sign in with Google to continue to your workspace.
          </p>
        </div>

        {/* Right panel — login card */}
        <div className="w-full md:w-[420px] flex-shrink-0">
          <div className="bg-[#f7f3ee] rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-[#5a000f] mb-1">University Sign-In</h2>
            <p className="text-gray-500 text-sm mb-6">Google sign-in for all users</p>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 text-sm text-gray-600 leading-relaxed">
              Use your Google account to sign in and access your workspace tools.
            </div>

            {!isSupabaseConfigured() && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-950 leading-relaxed">
                <span className="font-semibold">Google needs a real Supabase project.</span> Copy{' '}
                <code className="bg-white px-1 rounded border border-amber-200/80">.env.example</code> to{' '}
                <code className="bg-white px-1 rounded border border-amber-200/80">.env</code>, paste your Project URL and anon key from the Supabase dashboard, then restart <code className="bg-white px-1 rounded border border-amber-200/80">npm start</code>.
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl py-3 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-60 mb-2 shadow-sm"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <p className="text-center text-[11px] text-gray-400 mb-2">
              Trouble signing in? Check Google provider settings and redirect URLs in Supabase Authentication.
            </p>

            {loading && (
              <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-400">
                <Spinner /> Signing in...
              </div>
            )}
          </div>
        </div>
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

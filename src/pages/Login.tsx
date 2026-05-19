import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getOAuthRedirectTo,
  OAUTH_CALLBACK_ERROR_STORAGE_KEY,
  requiredOAuthRedirectUrl,
  isDevOAuthPortMismatch,
} from '../lib/oauthRedirect';
import {
  getConfiguredStudentDomains,
  STUDENT_EMAIL_REJECT_STORAGE_KEY,
} from '../lib/studentEmailPolicy';

const campusStudentDomains = getConfiguredStudentDomains();

export default function Login() {
  const navigate = useNavigate();
  const [oauthPending, setOauthPending] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code')
  );
  const { loading: authInitializing, session, user } = useAuth();

  /** Clears “Completing sign-in…” when boot finishes or times out (avoids infinite spinner). */
  const oauthCompleting = oauthPending && authInitializing;

  useEffect(() => {
    if (!authInitializing) setOauthPending(false);
  }, [authInitializing]);

  useEffect(() => {
    if (!oauthPending || !authInitializing) return;
    const t = window.setTimeout(() => {
      setOauthPending(false);
      const redirect = requiredOAuthRedirectUrl();
      const portHint = isDevOAuthPortMismatch()
        ? ' Close other terminals and open http://localhost:5173/login (your dev server must use port 5173, not 5174/5175).'
        : '';
      setError(
        `Sign-in timed out.${portHint} In Supabase → Authentication → URL Configuration, add Redirect URL: ${redirect} Also add trafalgardreii@gmail.com under Google Cloud → Audience → Test users.`
      );
    }, 14_000);
    return () => window.clearTimeout(t);
  }, [oauthPending, authInitializing]);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authInitializing) return;
    const domainMsg = sessionStorage.getItem(STUDENT_EMAIL_REJECT_STORAGE_KEY);
    const oauthMsg = sessionStorage.getItem(OAUTH_CALLBACK_ERROR_STORAGE_KEY);
    if (domainMsg) {
      sessionStorage.removeItem(STUDENT_EMAIL_REJECT_STORAGE_KEY);
      setError(domainMsg);
      return;
    }
    if (oauthMsg) {
      sessionStorage.removeItem(OAUTH_CALLBACK_ERROR_STORAGE_KEY);
      setError(oauthMsg);
    }
  }, [authInitializing]);

  useEffect(() => {
    if (authInitializing || !session?.user) return;
    navigate('/', { replace: true });
  }, [authInitializing, session?.user, user?.id, navigate]);

  async function handleGoogle() {
    setError('');
    if (!isSupabaseConfigured()) {
      setError(
        import.meta.env.PROD
          ? 'Supabase env vars are missing in this build. In your host’s dashboard, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (from Supabase → Project Settings → API), then rebuild or redeploy.'
          : 'Google sign-in needs a real Supabase project. In the project folder, create `.env` with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase → Project Settings → API, then restart the dev server (npm run dev).'
      );
      return;
    }
    setGoogleBusy(true);
    /** Minimal OAuth request — extra scopes/queryParams often cause Google Error 400 invalid_request with Supabase. */
    const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectTo(),
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setGoogleBusy(false);
      return;
    }
    if (data.url) window.location.href = data.url;
    else setGoogleBusy(false);
  }

  const buttonLocked = oauthCompleting || googleBusy || authInitializing;

  return (
    <div className="min-h-screen bg-[#6b0014] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[55%] h-[70%] rounded-3xl bg-[#84001B]/60 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[60%] rounded-full bg-[#9b0020]/40 blur-3xl" />
        <div className="absolute top-[30%] right-[15%] w-[30%] h-[40%] rounded-full bg-[#a80022]/30 blur-2xl" />
      </div>

      <div className="relative w-full max-w-5xl flex items-center gap-10">
        <div className="flex-1 hidden md:block">
          <div className="inline-block mb-10">
            <span className="text-[11px] tracking-[0.18em] uppercase text-[#e8c8a0] border border-[#e8c8a0]/40 rounded-full px-4 py-1.5 bg-white/5 backdrop-blur-sm">
              Smart Docs Validator
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.08] mb-6 tracking-[0.06em] uppercase">
            <span className="text-[#f5e6c8]">Smart Docs</span>{' '}
            <span className="text-[#ffd21a]">Validator</span>
          </h1>

          <p className="text-white/55 text-base leading-relaxed max-w-[380px]">
            Sign in with your <span className="text-white/80 font-medium">Google</span> account.
          </p>
        </div>

        <div className="w-full md:w-[420px] flex-shrink-0">
          <div className="bg-[#f7f3ee] rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-[#5a000f] mb-1 text-center">Secure Sign-In</h2>
            <p className="text-gray-500 text-sm mb-6 text-center">Continue with Google.</p>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {campusStudentDomains.length > 0 && (
              <div className="bg-[#84001B]/8 border border-[#84001B]/20 rounded-xl p-3 mb-4 text-xs text-[#5a000f] leading-relaxed">
                <span className="font-semibold">Students:</span> use campus Google (
                {campusStudentDomains.map((d) => (
                  <code key={d} className="mx-0.5 rounded bg-white/80 px-1.5 py-0.5 border border-[#84001B]/15">
                    @{d}
                  </code>
                ))}
                ). Personal Gmail is not accepted for the student role when domains are enforced.
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 text-sm leading-relaxed text-gray-600">
              <span className="inline-block max-w-full font-medium antialiased [filter:blur(0.45px)]">
                The unified academic and Software Project Proposal
              </span>
            </div>

            {import.meta.env.DEV && isDevOAuthPortMismatch() && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-950 leading-relaxed">
                <span className="font-semibold">Wrong dev port.</span> OAuth is configured for{' '}
                <code className="bg-white px-1 rounded border border-amber-200/80">http://localhost:5173/login</code>.
                Stop other <code className="bg-white px-1 rounded">npm run dev</code> windows, then open that URL.
              </div>
            )}

            {!isSupabaseConfigured() && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-950 leading-relaxed">
                {import.meta.env.PROD ? (
                  <>
                    <span className="font-semibold">This build has no Supabase keys.</span> In your hosting
                    provider’s environment settings, add{' '}
                    <code className="bg-white px-1 rounded border border-amber-200/80">VITE_SUPABASE_URL</code> and{' '}
                    <code className="bg-white px-1 rounded border border-amber-200/80">VITE_SUPABASE_ANON_KEY</code>{' '}
                    (same as your local <code className="bg-white px-1 rounded border border-amber-200/80">.env</code>
                    ), then trigger a new build/redeploy.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Supabase project required.</span> Copy{' '}
                    <code className="bg-white px-1 rounded border border-amber-200/80">.env.example</code> to{' '}
                    <code className="bg-white px-1 rounded border border-amber-200/80">.env</code>, paste your Project
                    URL and anon key from the Supabase dashboard, then restart{' '}
                    <code className="bg-white px-1 rounded border border-amber-200/80">npm run dev</code>.
                  </>
                )}
              </div>
            )}

            {oauthCompleting && (
              <div className="flex items-center justify-center gap-2 mb-4 text-sm text-[#5a000f]/80 bg-white/90 border border-[#84001B]/15 rounded-xl py-3 px-3">
                <Spinner /> Completing sign-in…
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={buttonLocked}
              className="w-full flex items-center justify-center gap-3 border-2 border-gray-300 rounded-xl py-3 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-60 mb-2 shadow-sm"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <p className="text-center text-[11px] text-gray-400 mb-2 antialiased [filter:blur(0.35px)]">
              You&apos;ll be redirected to Google to sign in securely
            </p>

            {googleBusy && (
              <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-400">
                <Spinner /> Opening Google…
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
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

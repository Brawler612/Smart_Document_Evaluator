import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Save,
  CheckCircle,
  AlertCircle,
  Mail,
  BadgeCheck,
  UserRound,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../../components/UserAvatar';

export default function Settings() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || '');
    setProfileMsg(null);
  }, [user?.id, user?.full_name]);

  const trimmed = fullName.trim();
  const noChanges = !!(user?.full_name ?? '').trim() && trimmed === (user?.full_name ?? '').trim();

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !trimmed) return;
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.from('users').update({ full_name: trimmed }).eq('id', user.id);
    setSavingProfile(false);
    setProfileMsg(
      error
        ? { type: 'error', text: 'Could not save your name. Try again in a moment.' }
        : { type: 'success', text: 'Your display name has been saved.' }
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100/95 via-[#faf8f8] to-slate-100/85">
      <div className="p-6 md:p-8 max-w-xl lg:max-w-2xl mx-auto pb-20">
        <header className="mb-10">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#84001B]">Your profile</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#84001B] text-[#ffd21a] shrink-0 shadow-sm">
              <UserRound className="w-[22px] h-[22px]" aria-hidden />
            </span>
            <span className="pt-1">Account settings</span>
          </h1>
          <p className="text-slate-600 text-sm mt-3 max-w-md leading-relaxed">
            Update how your name appears, and review how Google keeps your sign-in secure.
          </p>
        </header>

        <div className="space-y-6">
          <section className="bg-white border border-slate-200/90 rounded-2xl p-6 md:p-7 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <UserAvatar
                src={user?.avatar_url}
                name={trimmed || user?.full_name}
                email={user?.email}
                size={56}
                rounded="2xl"
                className="shadow-inner border border-[#ffd21a]/40"
                fallbackBg="bg-gradient-to-br from-[#ffd21a]/35 to-[#ffd21a]/10"
                fallbackFg="text-[#84001B]"
              />
              <div className="min-w-0 pt-0.5">
                <h2 className="font-bold text-slate-900 leading-tight text-lg">
                  {trimmed || 'Add your name'}
                </h2>
                <p className="text-sm text-slate-500 mt-1 truncate">{user?.email ?? '—'}</p>
              </div>
            </div>

            {profileMsg && (
              <div
                className={`flex items-start gap-2.5 p-3.5 rounded-xl mb-5 text-sm border ${
                  profileMsg.type === 'success'
                    ? 'bg-[#ffd21a]/12 text-slate-800 border-[#84001B]/15'
                    : 'bg-red-50 text-red-800 border-red-100'
                }`}
                role={profileMsg.type === 'error' ? 'alert' : 'status'}
              >
                {profileMsg.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 text-[#84001B] mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                {profileMsg.text}
              </div>
            )}

            <form onSubmit={updateProfile} className="space-y-5">
              <div>
                <label htmlFor="settings-full-name" className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Full name
                </label>
                <input
                  id="settings-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="e.g. Casey Martinez"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]"
                />
              </div>

              <div className="rounded-xl bg-slate-50/90 border border-slate-100 p-4 md:p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Account details</p>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#84001B]/50 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
                      <input
                        value={user?.email ?? ''}
                        disabled
                        readOnly
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200/80 rounded-xl text-sm bg-white text-slate-600 cursor-default"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-snug">Sign-in email is managed by Google — change it there if needed.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                      Role
                    </label>
                    <div className="relative">
                      <BadgeCheck className="w-4 h-4 text-[#84001B]/50 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
                      <input
                        value={user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'}
                        disabled
                        readOnly
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200/80 rounded-xl text-sm bg-white text-slate-600 cursor-default"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={savingProfile || !trimmed || noChanges}
                  className="inline-flex items-center gap-2 bg-[#84001B] text-[#ffd21a] px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm"
                >
                  <Save className="w-4 h-4" aria-hidden />
                  {savingProfile ? 'Saving…' : 'Save name'}
                </button>
                <button
                  type="button"
                  disabled={noChanges && !profileMsg}
                  onClick={() => {
                    setFullName(user?.full_name || '');
                    setProfileMsg(null);
                  }}
                  className="inline-flex items-center gap-2 border border-slate-300 bg-white text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Cancel
                </button>
                {noChanges && trimmed && (
                  <span className="text-xs text-slate-500">No edits to save yet.</span>
                )}
              </div>
            </form>
          </section>

          <section className="bg-white border border-slate-200/90 rounded-2xl p-6 md:p-7 shadow-sm">
            <div className="flex items-start gap-4 mb-5">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-[#84001B]/15 bg-gradient-to-br from-[#ffd21a]/35 to-transparent text-[#84001B]"
                aria-hidden
              >
                <ShieldCheck className="w-[22px] h-[22px]" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight">Account security</h2>
                <p className="text-sm text-slate-500 mt-1">Google OAuth protects your login for this portal.</p>
              </div>
            </div>
            <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
              <ul className="list-none space-y-2.5">
                <li className="flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#ffd21a] shrink-0 shadow-sm" aria-hidden />
                  <span>Your password stays with Google — this app never stores it.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#84001B]/50 shrink-0" aria-hidden />
                  <span>If you lose access, recover it through Google account help, not here.</span>
                </li>
              </ul>
              <div className="rounded-xl border border-[#84001B]/12 bg-gradient-to-br from-[#ffd21a]/10 to-slate-50/90 p-4 md:p-5">
                <p className="font-semibold text-slate-800 text-sm mb-1.5">Recommended</p>
                <p className="text-slate-600">
                  Turn on two-step verification in your Google account and review recent sign-in activity regularly.
                </p>
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-[#84001B] hover:underline"
                >
                  Google account security
                  <ExternalLink className="w-3.5 h-3.5 opacity-90" aria-hidden />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

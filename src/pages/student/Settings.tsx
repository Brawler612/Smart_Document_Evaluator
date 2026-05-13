import {
  ShieldCheck,
  Mail,
  BadgeCheck,
  UserRound,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../../components/UserAvatar';
import { resolveStudentDisplayName } from '../../lib/teacherSubmissionLoad';

export default function Settings() {
  const { user } = useAuth();
  const displayName =
    resolveStudentDisplayName(user?.email, user?.full_name)?.trim() || user?.full_name?.trim() || '—';

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
            Your display name is set from the official IT332 / CS342 class roster and cannot be changed here.
            Review how Google keeps your sign-in secure below.
          </p>
        </header>

        <div className="space-y-6">
          <section className="bg-white border border-slate-200/90 rounded-2xl p-6 md:p-7 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <UserAvatar
                src={user?.avatar_url}
                name={displayName}
                email={user?.email}
                size={56}
                rounded="2xl"
                className="shadow-inner border border-[#ffd21a]/40"
                fallbackBg="bg-gradient-to-br from-[#ffd21a]/35 to-[#ffd21a]/10"
                fallbackFg="text-[#84001B]"
              />
              <div className="min-w-0 pt-0.5">
                <h2 className="font-bold text-slate-900 leading-tight text-lg">{displayName}</h2>
                <p className="text-sm text-slate-500 mt-1 truncate">{user?.email ?? '—'}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="settings-full-name" className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Full name
                </label>
                <input
                  id="settings-full-name"
                  value={displayName}
                  disabled
                  readOnly
                  aria-readonly="true"
                  className="w-full px-4 py-3 border border-slate-200/80 rounded-xl text-sm bg-slate-50 text-slate-700 cursor-default"
                />
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  To correct a spelling, ask your instructor — the roster is updated in Smart Docs, not in Google.
                </p>
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
            </div>
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

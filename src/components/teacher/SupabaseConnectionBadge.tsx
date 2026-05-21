import { getSupabaseProjectHost, isSupabaseConfigured } from '../../lib/supabase';

/** Small status chip so teachers can confirm the app points at the right Supabase project. */
export default function SupabaseConnectionBadge() {
  if (!isSupabaseConfigured()) {
    return (
      <p
        className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug"
        role="status"
      >
        Supabase is not configured in this build. Add{' '}
        <span className="font-semibold">VITE_SUPABASE_URL</span> and{' '}
        <span className="font-semibold">VITE_SUPABASE_ANON_KEY</span> to <span className="font-mono">.env</span>,
        then restart <span className="font-mono">npm run dev</span>.
      </p>
    );
  }

  return (
    <p
      className="text-[11px] text-emerald-900 bg-emerald-50/90 border border-emerald-200 rounded-lg px-3 py-2 leading-snug"
      role="status"
    >
      Connected to Supabase: <span className="font-mono font-semibold">{getSupabaseProjectHost()}</span>
    </p>
  );
}

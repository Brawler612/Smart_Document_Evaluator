import { useMemo, useState } from 'react';

interface UserAvatarProps {
  /** OAuth profile picture URL. Falls back to initials if missing or fails to load. */
  src?: string | null;
  /** Full display name; used to derive initials when no picture is shown. */
  name?: string | null;
  /** Email; secondary source for the initial when `name` is empty. */
  email?: string | null;
  /** Pixel size requested from Google's CDN (controls the `=sNN-c` suffix on `lh3.googleusercontent.com`). */
  size?: number;
  /** Extra classes for the outer element. The component always renders as a circle. */
  className?: string;
  /** Override background/foreground colors. Defaults match the brand maroon + yellow palette. */
  fallbackBg?: string;
  fallbackFg?: string;
  /** Use square corners instead of a full circle (e.g. for table rows). */
  rounded?: 'full' | 'lg' | '2xl';
  title?: string;
}

function deriveInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
  if (!source) return 'U';
  const tokens = source
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return source.charAt(0).toUpperCase();
  const first = tokens[0]?.charAt(0) ?? '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1]?.charAt(0) ?? '' : '';
  return (first + last).toUpperCase() || 'U';
}

/** Rewrite the `=sNN-c` size hint Google attaches to `lh3.googleusercontent.com` URLs. */
function withGoogleSize(url: string, size: number): string {
  if (!/googleusercontent\.com/i.test(url)) return url;
  return url.replace(/=s\d+(-c)?$/i, `=s${size}-c`);
}

const ROUND_MAP = { full: 'rounded-full', lg: 'rounded-lg', '2xl': 'rounded-2xl' } as const;

export default function UserAvatar({
  src,
  name,
  email,
  size = 40,
  className = '',
  fallbackBg = 'bg-gradient-to-br from-[#ffd21a] to-[#f5c400]',
  fallbackFg = 'text-[#84001B]',
  rounded = 'full',
  title,
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const initials = useMemo(() => deriveInitials(name, email), [name, email]);
  const resolvedSrc = useMemo(() => {
    if (!src) return null;
    const trimmed = src.trim();
    if (!trimmed) return null;
    return withGoogleSize(trimmed, Math.min(Math.max(size * 2, 64), 256));
  }, [src, size]);

  const dimension = { width: size, height: size };
  const roundClass = ROUND_MAP[rounded];
  const sharedClass = `inline-flex items-center justify-center overflow-hidden select-none flex-shrink-0 ${roundClass} ${className}`;

  if (resolvedSrc && !broken) {
    return (
      <img
        src={resolvedSrc}
        alt={name ?? email ?? 'User profile picture'}
        title={title ?? name ?? email ?? undefined}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${sharedClass} object-cover bg-white border border-slate-200/60`}
        style={dimension}
      />
    );
  }

  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <span
      aria-hidden="true"
      title={title ?? name ?? email ?? undefined}
      className={`${sharedClass} ${fallbackBg} ${fallbackFg} font-bold tracking-tight`}
      style={{ ...dimension, fontSize }}
    >
      {initials}
    </span>
  );
}

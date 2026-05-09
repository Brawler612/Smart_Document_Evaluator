import { useEffect, useMemo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

/** True when we have a non-empty stored URL that is safe to expose as a navigation target. */
export function submissionHasOpenableFileUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return false;
  return !/^(javascript|vbscript):/i.test(t);
}

export function parseDataUrl(url: string): { mime: string; isBase64: boolean; data: string } | null {
  if (!url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma < 5) return null;
  const header = url.slice(5, comma);
  const data = url.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mime = (header.split(';')[0] || 'text/plain').trim();
  return { mime, isBase64, data };
}

/** Map original filename so `Blob` / new tab use the right viewer (PDF, Word, PPT, images, text). */
export function mimeTypeFromFileName(fileName: string): string | null {
  const base = fileName.trim().split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = base.slice(dot).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain;charset=utf-8',
    '.csv': 'text/csv;charset=utf-8',
    '.md': 'text/markdown;charset=utf-8',
    '.html': 'text/html;charset=utf-8',
    '.htm': 'text/html;charset=utf-8',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.jfif': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
  };
  return map[ext] ?? null;
}

function resolveBlobMime(parsedMime: string, fileName?: string): string {
  const guessed = fileName?.trim() ? mimeTypeFromFileName(fileName) : null;
  const m = (parsedMime || '').trim().toLowerCase();
  const generic =
    !m || m === 'text/plain' || m === 'application/octet-stream' || m === 'binary/octet-stream';
  if (generic && guessed) return guessed;
  return (parsedMime || '').trim() || guessed || 'application/octet-stream';
}

/** Prefer opening via blob: URLs — large `data:` strings often fail on synthetic navigations in some browsers. */
function dataUrlToBlobUrl(dataUrl: string, fileName?: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const { mime, isBase64, data } = parsed;
  try {
    const bytes: Uint8Array = isBase64
      ? Uint8Array.from(atob(data.replace(/\s/g, '')), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data.replace(/\+/g, '%20')));
    const blobType = resolveBlobMime(mime, fileName);
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: blobType }));
  } catch {
    return null;
  }
}

/** If blob conversion fails, rewrite the `data:` header from the filename so inline open uses the right viewer. */
function retargetDataUrlMimeFromFileName(dataUrl: string, fileName?: string): string | null {
  const guessed = fileName?.trim() ? mimeTypeFromFileName(fileName) : null;
  if (!guessed) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const payload = dataUrl.slice(comma + 1);
  return parsed.isBase64 ? `data:${guessed};base64,${payload}` : `data:${guessed},${payload}`;
}

export function resolveSubmissionOpenHref(raw: string, fileName?: string): {
  href: string;
  blobToRevoke: string | null;
} {
  const t = raw.trim();
  if (!t) return { href: '', blobToRevoke: null };
  if (/^(javascript|vbscript):/i.test(t)) return { href: '', blobToRevoke: null };
  if (t.startsWith('data:')) {
    const blobUrl = dataUrlToBlobUrl(t, fileName);
    if (blobUrl) return { href: blobUrl, blobToRevoke: blobUrl };
    const retargeted = retargetDataUrlMimeFromFileName(t, fileName);
    return { href: retargeted || t, blobToRevoke: null };
  }
  return { href: t, blobToRevoke: null };
}

/** Delayed revoke for `blob:` URLs created when opening uploaded `data:` files. */
export function scheduleSubmissionBlobRevoke(blobUrl: string | null): void {
  if (!blobUrl) return;
  const blob = blobUrl;
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(blob);
    } catch {
      /* ignore */
    }
  }, 300_000);
}

/** Programmatic open for popup-blocking / backup from buttons (same MIME / blob behaviour as `<a>`). */
export function openSubmissionAttachmentNewTab(raw: string, fileName?: string): boolean {
  const { href, blobToRevoke } = resolveSubmissionOpenHref(raw, fileName);
  if (!href) return false;
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  scheduleSubmissionBlobRevoke(blobToRevoke);
  return true;
}

/**
 * Real `<a target="_blank">` after resolving `data:` → `blob:` so the browser treats it like a normal link click.
 * Handles `http(s):`, `blob:`, and `data:` URLs.
 */
export function SubmissionOpenLink({
  raw,
  fileName,
  className,
  children,
}: {
  raw: string;
  fileName?: string;
  className: string;
  children?: ReactNode;
}) {
  const { href, blobToRevoke } = useMemo(() => resolveSubmissionOpenHref(raw, fileName), [raw, fileName]);

  useEffect(() => {
    scheduleSubmissionBlobRevoke(blobToRevoke);
  }, [blobToRevoke]);

  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? (
        <>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Open file
        </>
      )}
    </a>
  );
}

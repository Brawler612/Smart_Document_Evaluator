import { useEffect, useMemo, useState } from 'react';
import { mimeTypeFromFileName, parseDataUrl } from '../components/SubmissionOpenLink';

export type SubmissionUrlKind = 'data' | 'blob' | 'http' | 'unknown' | 'none';

export interface SubmissionFileMeta {
  /** Uppercase extension without dot, or empty string when none. */
  extension: string;
  /** Best-effort MIME type derived from data URL header or filename. */
  mime: string;
  /** Decoded byte length when computable (data URLs only). null when unknowable. */
  bytes: number | null;
  /** Human-readable size, or "—" when unknown. */
  sizeLabel: string;
  /** What kind of URL we're storing. */
  urlKind: SubmissionUrlKind;
  /** Friendly label for the URL kind, e.g. "Cloud link" or "Embedded data". */
  urlKindLabel: string;
}

function approximateDataUrlBytes(rawDataUrl: string): number | null {
  const parsed = parseDataUrl(rawDataUrl);
  if (!parsed) return null;
  const cleanData = parsed.data.replace(/\s/g, '');
  if (parsed.isBase64) {
    if (!cleanData) return 0;
    let padding = 0;
    if (cleanData.endsWith('==')) padding = 2;
    else if (cleanData.endsWith('=')) padding = 1;
    return Math.max(0, Math.floor((cleanData.length * 3) / 4) - padding);
  }
  try {
    const decoded = decodeURIComponent(cleanData.replace(/\+/g, '%20'));
    return new Blob([decoded]).size;
  } catch {
    return cleanData.length;
  }
}

export function fileExtensionFromName(name: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name?.trim() ?? '');
  return m ? m[1].toUpperCase() : '';
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(2)} MB`;
  if (mb < 100) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

function classifyUrlKind(raw: string | null | undefined): SubmissionUrlKind {
  const t = raw?.trim();
  if (!t) return 'none';
  if (t.startsWith('data:')) return 'data';
  if (t.startsWith('blob:')) return 'blob';
  if (/^https?:/i.test(t)) return 'http';
  return 'unknown';
}

const URL_KIND_LABEL: Record<SubmissionUrlKind, string> = {
  data: 'Embedded data',
  blob: 'Local blob',
  http: 'Cloud link',
  unknown: 'Other',
  none: 'No file URL',
};

/** Derive size + MIME + extension info for a submission row. */
export function describeSubmissionFile(fileUrl: string | null | undefined, fileName: string | null | undefined): SubmissionFileMeta {
  const extension = fileExtensionFromName(fileName);
  const urlKind = classifyUrlKind(fileUrl);
  let mime = mimeTypeFromFileName(fileName ?? '') ?? '';
  let bytes: number | null = null;

  if (urlKind === 'data' && fileUrl) {
    const parsed = parseDataUrl(fileUrl);
    if (parsed) {
      mime = parsed.mime || mime || 'application/octet-stream';
      bytes = approximateDataUrlBytes(fileUrl);
    }
  }

  if (!mime) {
    mime = extension ? `application/${extension.toLowerCase()}` : 'application/octet-stream';
  }

  return {
    extension,
    mime,
    bytes,
    sizeLabel: formatBytes(bytes),
    urlKind,
    urlKindLabel: URL_KIND_LABEL[urlKind],
  };
}

/** Cache: url → bytes (null when measurement failed). Avoids re-fetching the same file on every list render. */
const httpSizeCache = new Map<string, number | null>();
const inFlight = new Map<string, Promise<number | null>>();

async function fetchHttpFileBytes(url: string): Promise<number | null> {
  if (httpSizeCache.has(url)) return httpSizeCache.get(url) ?? null;
  const existing = inFlight.get(url);
  if (existing) return existing;

  const run = (async (): Promise<number | null> => {
    let bytes: number | null = null;

    /** Most public Supabase Storage / S3 / CDN URLs answer HEAD with Content-Length. */
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (head.ok) {
        const cl = head.headers.get('content-length');
        if (cl) bytes = Number.parseInt(cl, 10);
      }
    } catch {
      /* CORS or network failure — fall through to range probe */
    }

    /** Fallback: a 1-byte ranged GET returns 206 + `Content-Range: bytes 0-0/<total>`. */
    if (bytes == null || Number.isNaN(bytes)) {
      try {
        const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
        const cr = r.headers.get('content-range');
        const match = cr ? /\/(\d+)\s*$/.exec(cr) : null;
        if (match) {
          bytes = Number.parseInt(match[1], 10);
        } else if (r.ok) {
          const cl = r.headers.get('content-length');
          if (cl) bytes = Number.parseInt(cl, 10);
        }
      } catch {
        /* ignore — leave bytes null */
      }
    }

    const final = bytes != null && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
    httpSizeCache.set(url, final);
    return final;
  })();

  inFlight.set(url, run);
  try {
    return await run;
  } finally {
    inFlight.delete(url);
  }
}

/**
 * Returns the synchronous meta immediately, then resolves real byte size for cloud-hosted files
 * via a HEAD/Range request. Cached per URL, so reusing the same file across rows is free.
 */
export function useSubmissionFileMeta(
  fileUrl: string | null | undefined,
  fileName: string | null | undefined
): { meta: SubmissionFileMeta; measuring: boolean } {
  const initial = useMemo<SubmissionFileMeta>(() => {
    const base = describeSubmissionFile(fileUrl, fileName);
    if (base.bytes == null && base.urlKind === 'http' && fileUrl && httpSizeCache.has(fileUrl)) {
      const cached = httpSizeCache.get(fileUrl) ?? null;
      if (cached != null) {
        return { ...base, bytes: cached, sizeLabel: formatBytes(cached) };
      }
    }
    return base;
  }, [fileUrl, fileName]);

  const [meta, setMeta] = useState<SubmissionFileMeta>(initial);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    setMeta(initial);
    if (initial.bytes != null || initial.urlKind !== 'http' || !fileUrl) {
      setMeasuring(false);
      return;
    }
    let cancelled = false;
    setMeasuring(true);
    void fetchHttpFileBytes(fileUrl).then((bytes) => {
      if (cancelled) return;
      setMeasuring(false);
      if (bytes != null) {
        setMeta((prev) => ({ ...prev, bytes, sizeLabel: formatBytes(bytes) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initial, fileUrl]);

  return { meta, measuring };
}

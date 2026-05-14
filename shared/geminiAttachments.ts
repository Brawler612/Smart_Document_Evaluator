/**
 * Pulls submission files off Supabase storage / data URLs and converts them
 * into the `inlineData` shape Gemini accepts. Lets the AI grade visual,
 * audio, video, and PDF content — not just the plaintext we already extract
 * for the inspection textarea.
 *
 * Gemini multimodal accepts the following MIME types as inline data:
 *  - application/pdf
 *  - image/*  (png, jpeg, webp, heic, heif, gif, bmp)
 *  - audio/*  (wav, mp3, ogg, aac, flac, m4a, aiff)
 *  - video/*  (mp4, mov, webm, mpeg, 3gpp, avi, flv, wmv)
 *  - text/*   (we already send the text body via `content`, so we skip
 *             these here to avoid duplicating tokens)
 *
 * DOCX is not natively understood by Gemini — but the file is a ZIP, so we
 * use mammoth's convertToHtml hook to pull every embedded image out of
 * `word/media/` and send them as inline image parts. That way diagrams,
 * screenshots, photos, charts, and pasted images inside a Word report can
 * be evaluated even though the prose still travels via `content`.
 *
 * Inline payload limit per request is ~20 MB across all parts. We cap a
 * single attachment at 18 MB and the cumulative attachment payload at
 * 19 MB to leave headroom for the prompt itself.
 */

import mammoth from 'mammoth';
import type { GeminiInlineAttachment } from './geminiInlineTypes';

export type { GeminiInlineAttachment } from './geminiInlineTypes';

const SINGLE_ATTACHMENT_BYTE_LIMIT = 18 * 1024 * 1024;
const TOTAL_ATTACHMENT_BYTE_LIMIT = 19 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

const EXT_TO_MIME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
};

const DOCX_MIMES = new Set<string>([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-word',
  'application/octet-stream',
]);

export function isGeminiSupportedInlineMime(mime: string): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase().split(';')[0].trim();
  if (m === 'application/pdf') return true;
  if (m.startsWith('image/')) return true;
  if (m.startsWith('audio/')) return true;
  if (m.startsWith('video/')) return true;
  return false;
}

function guessMimeFromHref(href: string): string | null {
  const m = href.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return EXT_TO_MIME[key] ?? null;
}

function looksLikeDocxByHref(href: string): boolean {
  return /\.docx?(\?|#|$)/i.test(href);
}

function looksLikeDocxByMime(mime: string): boolean {
  return DOCX_MIMES.has(mime.toLowerCase().split(';')[0].trim());
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function withProtocol(href: string): string {
  return href.startsWith('//') ? `https:${href}` : href;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

/** ~Estimated decoded byte size of a base64 string (without re-allocating it). */
function base64ByteSize(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

function parseDataUrlPayload(href: string): { mime: string; isBase64: boolean; data: string } | null {
  const m = /^data:([^,;]+)?((?:;[^,]+)*),([\s\S]*)$/i.exec(href);
  if (!m) return null;
  const mime = (m[1] ?? 'text/plain').trim();
  const flags = (m[2] ?? '').toLowerCase();
  const isBase64 = flags.includes(';base64');
  return { mime, isBase64, data: m[3] ?? '' };
}

/** Decode a data URL straight into a Uint8Array (base64 only — non-base64 returns null). */
function dataUrlToBytes(parsed: { mime: string; isBase64: boolean; data: string }): Uint8Array | null {
  if (!parsed.isBase64) return null;
  try {
    const bin = globalThis.atob(parsed.data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Pull each `word/media/*` image out of a .docx via mammoth's image hook. */
async function extractDocxEmbeddedImages(buf: ArrayBuffer): Promise<GeminiInlineAttachment[]> {
  const found: GeminiInlineAttachment[] = [];
  let totalBytes = 0;
  let idx = 0;

  try {
    await mammoth.convertToHtml(
      { arrayBuffer: buf },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (found.length >= MAX_ATTACHMENTS) return { src: '' };
          try {
            const b64 = await image.read('base64');
            const mime = (image.contentType || 'image/png').toLowerCase();
            if (!mime.startsWith('image/')) return { src: '' };
            const size = base64ByteSize(b64);
            if (size > SINGLE_ATTACHMENT_BYTE_LIMIT) return { src: '' };
            if (totalBytes + size > TOTAL_ATTACHMENT_BYTE_LIMIT) return { src: '' };
            totalBytes += size;
            idx += 1;
            found.push({
              mimeType: mime,
              data: b64,
              fileName: `embedded-image-${idx}.${mime.split('/')[1] || 'png'}`,
              role: `Image #${idx} embedded inside the Word file`,
            });
          } catch {
            /* skip unreadable image */
          }
          return { src: '' };
        }),
      }
    );
  } catch {
    /* mammoth choked — return whatever we already collected (probably nothing) */
  }
  return found;
}

async function fetchHttpBytes(href: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  try {
    const res = await fetch(href);
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return { bytes, mime: ct };
  } catch {
    return null;
  }
}

/**
 * Builds zero-or-more inline attachments from a submission's file URL.
 * Skips formats Gemini can't read natively (e.g. PowerPoint, Excel, ZIP) —
 * for those, the existing text inspection / "Open file" flow still applies.
 */
export async function loadSubmissionAttachmentsForGemini(sub: {
  file_url?: string | null;
  file_name?: string | null;
}): Promise<GeminiInlineAttachment[]> {
  const href = sub.file_url?.trim();
  if (!href) return [];

  const fileName = sub.file_name?.trim() || undefined;
  const collected: GeminiInlineAttachment[] = [];
  let totalBytes = 0;

  const pushAttachment = (att: GeminiInlineAttachment): boolean => {
    if (collected.length >= MAX_ATTACHMENTS) return false;
    const size = base64ByteSize(att.data);
    if (size > SINGLE_ATTACHMENT_BYTE_LIMIT) return false;
    if (totalBytes + size > TOTAL_ATTACHMENT_BYTE_LIMIT) return false;
    totalBytes += size;
    collected.push(att);
    return true;
  };

  if (href.startsWith('blob:')) {
    return [];
  }

  if (href.startsWith('data:')) {
    const parsed = parseDataUrlPayload(href);
    if (!parsed) return [];
    const mime = parsed.mime.toLowerCase();
    if (isGeminiSupportedInlineMime(mime) && parsed.isBase64) {
      pushAttachment({ mimeType: mime, data: parsed.data, fileName, role: 'Submitted file' });
      return collected;
    }
    if (looksLikeDocxByMime(mime) || (fileName && looksLikeDocxByHref(fileName))) {
      const bytes = dataUrlToBytes(parsed);
      if (!bytes) return [];
      const images = await extractDocxEmbeddedImages(bytes.buffer);
      for (const img of images) {
        if (!pushAttachment(img)) break;
      }
    }
    return collected;
  }

  const httpUrl = withProtocol(href);
  if (!isHttpUrl(httpUrl)) return [];

  const fetched = await fetchHttpBytes(httpUrl);
  if (!fetched) return [];

  const httpMime = fetched.mime || guessMimeFromHref(httpUrl) || '';
  const lowerMime = httpMime.toLowerCase();

  if (isGeminiSupportedInlineMime(lowerMime)) {
    if (fetched.bytes.byteLength <= SINGLE_ATTACHMENT_BYTE_LIMIT) {
      pushAttachment({
        mimeType: lowerMime,
        data: arrayBufferToBase64(fetched.bytes),
        fileName,
        role: 'Submitted file',
      });
    }
    return collected;
  }

  if (looksLikeDocxByMime(lowerMime) || looksLikeDocxByHref(httpUrl)) {
    const images = await extractDocxEmbeddedImages(fetched.bytes);
    for (const img of images) {
      if (!pushAttachment(img)) break;
    }
  }

  return collected;
}

/** Compact human-readable summary of what was attached, for inline notices. */
export function summarizeAttachmentsForNotice(attachments: GeminiInlineAttachment[]): string {
  if (attachments.length === 0) return '';
  const counts = new Map<string, number>();
  for (const a of attachments) {
    const major = a.mimeType.split('/')[0] || 'file';
    const bucket =
      a.mimeType === 'application/pdf'
        ? 'PDF page set'
        : major === 'image'
          ? 'image'
          : major === 'audio'
            ? 'audio clip'
            : major === 'video'
              ? 'video clip'
              : a.mimeType;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, n]) => `${n} ${bucket}${n === 1 ? '' : 's'}`)
    .join(', ');
}

import type { GeminiInlineAttachment } from './geminiInlineTypes';

/**
 * Vercel serverless HTTP request bodies are capped (~4.5 MiB). JSON adds
 * template, rubric, text, and field names — keep base64 payload sum under this
 * so `/api/gemini-evaluate` is not rejected with 413 FUNCTION_PAYLOAD_TOO_LARGE.
 */
export const VERCEL_GEMINI_PROXY_MAX_BASE64_CHARS = 2_200_000;

/** Sum of `data` string lengths (base64) for inline parts. */
export function sumAttachmentBase64Chars(attachments: readonly GeminiInlineAttachment[]): number {
  let n = 0;
  for (const a of attachments) {
    if (typeof a.data === 'string') n += a.data.length;
  }
  return n;
}

/**
 * Fits inline parts under Vercel's POST size cap. Prefers PDF(s) when they fit,
 * then fills with smallest non-PDF parts so diagrams can still ship if the PDF
 * alone is too large.
 */
export function clampInlineAttachmentsForVercelProxy(
  attachments: GeminiInlineAttachment[],
  maxBase64CharsSum = VERCEL_GEMINI_PROXY_MAX_BASE64_CHARS
): GeminiInlineAttachment[] {
  if (!attachments.length) return [];

  const pdf = attachments.filter((a) => a.mimeType === 'application/pdf');
  const nonPdf = attachments.filter((a) => a.mimeType !== 'application/pdf');
  const bySize = (a: GeminiInlineAttachment, b: GeminiInlineAttachment) => a.data.length - b.data.length;

  const tryPack = (order: GeminiInlineAttachment[]): GeminiInlineAttachment[] => {
    let sum = 0;
    const out: GeminiInlineAttachment[] = [];
    for (const a of order) {
      const len = a.data.length;
      if (!len) continue;
      if (sum + len > maxBase64CharsSum) continue;
      sum += len;
      out.push(a);
    }
    return out;
  };

  const orderPdfFirst = [...pdf, ...[...nonPdf].sort(bySize)];
  const packed = tryPack(orderPdfFirst);
  if (packed.length > 0) return packed;

  return tryPack([...attachments].sort(bySize));
}

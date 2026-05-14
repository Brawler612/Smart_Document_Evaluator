/**
 * Gemini multimodal `inlineData` shape — lives in its own module so serverless
 * code (e.g. `geminiDocumentEvaluation.ts`) never imports `geminiAttachments.ts`,
 * which pulls in `mammoth` and can crash Vercel functions at cold start.
 */
export type GeminiInlineAttachment = {
  /** Mime type Gemini will use to decode the bytes (e.g. 'image/png'). */
  mimeType: string;
  /** Raw base64 payload, no `data:` URL prefix, no newlines. */
  data: string;
  /** Optional display name for prompt instructions / debug logs. */
  fileName?: string;
  /** Optional one-line description (e.g. "Embedded image 3 inside Word file"). */
  role?: string;
};

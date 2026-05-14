/**
 * Resolves how the grading UI should reach Gemini: explicit proxy URL,
 * browser-exposed API key (local dev), or same-origin `/api/gemini-evaluate`
 * on production builds (Vercel holds `GEMINI_API_KEY` server-side).
 */

export type GeminiEvalRuntime = {
  /** POST target for `runGeminiBackedEvaluation` (or null to use direct browser key). */
  evalUrl: string | null;
  /** Only set for local/dev when `VITE_GEMINI_API_KEY` is in the bundle. */
  apiKey: string | null;
  model: string | undefined;
};

export function resolveGeminiEvalRuntime(): GeminiEvalRuntime {
  const explicit = (import.meta.env.VITE_GEMINI_EVAL_URL as string | undefined)?.trim();
  const browserKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  const model = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();

  if (explicit) {
    return { evalUrl: explicit, apiKey: null, model: model || undefined };
  }
  /**
   * Production: always use the same-origin proxy first so the key can live in
   * `GEMINI_API_KEY` (server-only). If we checked `browserKey` before this,
   * an empty client bundle key would skip the proxy even when the server has a key.
   */
  if (import.meta.env.PROD) {
    return { evalUrl: '/api/gemini-evaluate', apiKey: null, model: model || undefined };
  }
  if (browserKey) {
    return { evalUrl: null, apiKey: browserKey, model: model || undefined };
  }
  return { evalUrl: null, apiKey: null, model: model || undefined };
}

/** @deprecated Prefer probing GET /api/gemini-evaluate + `geminiEvalReady` in ReviewQueue — production needs GEMINI_API_KEY on Vercel. */
export function isGeminiLiveConfiguredForClient(): boolean {
  return Boolean(
    (import.meta.env.VITE_GEMINI_EVAL_URL as string | undefined)?.trim() ||
      (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ||
      import.meta.env.PROD
  );
}

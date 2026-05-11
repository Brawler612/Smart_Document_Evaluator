/**
 * Run: npm run verify:gemini
 * One-shot check that VITE_GEMINI_API_KEY can call the Generative Language API (same as the app).
 * Reads .env from the project root — does not print your key.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

console.log('Gemini API smoke test (Generative Language API)\n');

if (!fs.existsSync(envPath)) {
  console.error('× No .env file. Copy .env.example to .env and set VITE_GEMINI_API_KEY.\n');
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const apiKey = env.VITE_GEMINI_API_KEY?.trim();
const evalUrl = env.VITE_GEMINI_EVAL_URL?.trim();
const envModel = env.VITE_GEMINI_MODEL?.trim() || '';

/** Prefer current defaults first (Google turns off older ids for new accounts). */
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  envModel,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-pro',
].filter((id, i, a) => id && a.indexOf(id) === i);

if (evalUrl && !apiKey) {
  console.log('ℹ VITE_GEMINI_EVAL_URL is set without VITE_GEMINI_API_KEY — the app uses your backend for Gemini.');
  console.log('  Add VITE_GEMINI_API_KEY to .env if you want this script to ping Google directly.\n');
  process.exit(0);
}

if (!apiKey) {
  console.error('× VITE_GEMINI_API_KEY is not set in .env.');
  console.error('  Google AI Studio → Get API key, paste into .env, then restart npm run dev.\n');
  process.exit(1);
}

const keyHint = `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
console.log(`Using key ${keyHint} and models: ${MODELS.join(', ')}\n`);

let lastErr = '';
for (const model of MODELS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly the word: OK' }] }],
        generationConfig: { maxOutputTokens: 16, temperature: 0 },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${text.slice(0, 400)}`;
      console.warn(`× ${model}: ${lastErr.slice(0, 200)}…`);
      continue;
    }
    let reply = '';
    try {
      const j = JSON.parse(text);
      reply = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch {
      reply = '';
    }
    console.log(`✓ Model "${model}" responded (${res.status}). Snippet: ${JSON.stringify(String(reply).slice(0, 80))}`);
    console.log('\nGemini is reachable. Restart the dev server if you changed .env, then use Run AI Inspection in Grading.\n');
    process.exit(0);
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
    console.warn(`× ${model}: ${lastErr}`);
  }
}

console.error('\n× No model responded successfully. Last error:', lastErr.slice(0, 500));
console.error(
  '\nCheck: (1) Billing linked to the same GCP project as this key, (2) API "Generative Language API" enabled, (3) key restrictions allow that API.\n'
);
process.exit(1);

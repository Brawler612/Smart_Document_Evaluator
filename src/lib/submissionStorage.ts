import { supabase } from './supabase';

const ENV_BUCKET = 'VITE_SUBMISSION_STORAGE_BUCKET';

/** Matches docs/supabase-storage-student-submissions.sql — used when env is unset so uploads get a real https URL. */
export const DEFAULT_SUBMISSION_STORAGE_BUCKET = 'student-submissions';

/** Max size to embed as data URL when Storage is unavailable (~32 MB binary). */
const MAX_EMBEDDED_ATTACHMENT_BYTES = 32 * 1024 * 1024;

async function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Produces `file_url` for a submission row: pasted text only, inlined file (`data:` or `https:` from Storage).
 * Throws a clear setup error only when file is oversized and Storage is unavailable.
 */
export async function resolveStudentSubmissionFileUrl(params: {
  file: File | null;
  extractedText: string;
  studentId: string;
}): Promise<string | null> {
  const trimmed = params.extractedText.trim();
  if (!params.file) {
    return trimmed ? `data:text/plain;charset=utf-8,${encodeURIComponent(trimmed)}` : null;
  }

  const { file, studentId } = params;
  const bucket = getSubmissionStorageBucket();

  if (bucket) {
    try {
      return await uploadSubmissionToSupabaseStorage(file, studentId);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[submission] Storage upload failed, trying inline:', e);
      }
    }
  }

  if (file.size <= MAX_EMBEDDED_ATTACHMENT_BYTES) {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl) return dataUrl;
  }

  if (bucket) {
    const hint =
      'Run docs/supabase-storage-student-submissions.sql in the Supabase SQL editor, then retry.';
    throw new Error(
      `Could not store this file (${(file.size / (1024 * 1024)).toFixed(1)} MB). ${hint}`
    );
  }

  throw new Error(
    `This attachment is ${(file.size / (1024 * 1024)).toFixed(1)} MB — too heavy for inline save. Set VITE_SUBMISSION_STORAGE_BUCKET (default: ${DEFAULT_SUBMISSION_STORAGE_BUCKET}) and run docs/supabase-storage-student-submissions.sql, or use a file under ~32 MB.`
  );
}

/**
 * Storage bucket for submission binaries. Defaults to `student-submissions` (see docs SQL).
 * Set `VITE_SUBMISSION_STORAGE_BUCKET=` empty or `off` to disable Storage and use inline data URLs only.
 */
export function getSubmissionStorageBucket(): string | undefined {
  const raw = import.meta.env[ENV_BUCKET];
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === '' || t === 'off' || t === 'false' || t === '0') return undefined;
    if (raw.trim()) return raw.trim();
  }
  return DEFAULT_SUBMISSION_STORAGE_BUCKET;
}

function sanitizeStoredFileName(name: string): string {
  const trimmed = String(name ?? '').trim() || 'upload.bin';
  return trimmed.replace(/[^\w.\-()+[\] ]+/g, '_').replace(/\s+/g, '_').slice(0, 180);
}

export async function uploadSubmissionToSupabaseStorage(file: File, studentId: string): Promise<string> {
  const bucket = getSubmissionStorageBucket();
  if (!bucket) throw new Error('NO_BUCKET');
  const path = `${sanitizeIdSegment(studentId)}/${Date.now()}_${sanitizeStoredFileName(file.name)}`;
  const ct = file.type?.trim() || guessedMimeFromName(file.name) || 'application/octet-stream';

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: ct,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function sanitizeIdSegment(id: string): string {
  return String(id).replace(/[^\w-]+/g, '').slice(0, 64) || 'anon';
}

function guessedMimeFromName(fileName: string): string | null {
  const ext = fileName.replace(/^.*\./, '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext] ?? null;
}

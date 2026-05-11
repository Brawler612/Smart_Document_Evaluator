import mammoth from 'mammoth';

/**
 * Pull plain text from a .docx (Office Open XML) buffer for AI grading.
 * Browser-safe; used after fetching the submission file.
 */
export async function extractTextFromDocxBuffer(buf: ArrayBuffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return value.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
}

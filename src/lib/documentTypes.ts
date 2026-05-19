/** Single document type for this course deployment. */
export const DOCUMENT_TYPES = ['SPP'] as const;

export type DocType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_DOC_TYPE: DocType = 'SPP';

export function normalizeDocType(_value: unknown): DocType {
  return DEFAULT_DOC_TYPE;
}

export function isDocType(value: unknown): value is DocType {
  return value === 'SPP';
}

export const DOC_TYPE_COLORS: Record<DocType, string> = {
  SPP: 'bg-[#84001B]/12 text-[#84001B]',
};

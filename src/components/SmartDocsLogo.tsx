interface SmartDocsLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

/** Maroon/yellow-brand mark: folded page + checklist lines + validated check — reads at ~24px. */
export default function SmartDocsLogo({ size = 24, color = 'currentColor', className }: SmartDocsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      {/* Folded sheet (document) */}
      <path
        d="M13.75 4.25H9A2 2 0 0 0 7 6.25v12A2 2 0 0 0 9 20.25h7a2 2 0 0 0 2-2v-9.3l-4.05-4.45a1.85 1.85 0 0 0-1.2-.55Z"
        fill="none"
        stroke={color}
        strokeWidth="1.65"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M13.75 4.25v4.95h4.85"
        fill="none"
        stroke={color}
        strokeWidth="1.65"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* “Content” scan lines */}
      <path
        d="M9 11.5h8M9 14h6"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity={0.5}
      />
      {/* Validation check */}
      <path
        d="M7 17l2.85 3L17 13"
        fill="none"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

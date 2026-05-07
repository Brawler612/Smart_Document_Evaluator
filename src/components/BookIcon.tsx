interface BookIconProps {
  size?: number;
  color?: string;
  className?: string;
}

export default function BookIcon({ size = 24, color = 'currentColor', className }: BookIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Left shape: rectangle with right side cut into a rightward-pointing V */}
      <polygon
        points="2,5 10,5 13,12 10,19 2,19"
        fill={color}
      />
      {/* Right shape: rectangle with left side cut into a leftward-pointing V */}
      <polygon
        points="22,5 14,5 11,12 14,19 22,19"
        fill={color}
      />
    </svg>
  );
}

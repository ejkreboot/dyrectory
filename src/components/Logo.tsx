export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <path
        d="M9 11.5a2 2 0 0 1 2-2h3.6l2 2H21a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z"
        fill="none"
        stroke="#f6f5f2"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

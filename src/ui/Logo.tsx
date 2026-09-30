interface LogoProps {
  size?: number
}

/** App mark: a clock face over a timeline — also the source for the app icon (build/icon.svg). */
export default function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="World Time Buddy logo"
      focusable="false"
    >
      <defs>
        <linearGradient id="wtb-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b86ff" />
          <stop offset="1" stopColor="#2340c9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#wtb-logo-bg)" />
      <circle cx="32" cy="29" r="17" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M32 19v10l7 4" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="50" width="12" height="5" rx="2.5" fill="#1a2a7a" opacity="0.55" />
      <rect x="26" y="50" width="12" height="5" rx="2.5" fill="#5be0a1" />
      <rect x="40" y="50" width="12" height="5" rx="2.5" fill="#1a2a7a" opacity="0.55" />
    </svg>
  )
}

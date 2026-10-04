import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** 24×24 stroke icons (same visual language as the settings glyph). Decorative: aria-hidden. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const ChevronUpIcon = () => (
  <Svg>
    <path d="M6 15l6-6 6 6" />
  </Svg>
)

export const ChevronDownIcon = () => (
  <Svg>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)

export const PencilIcon = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const HomeIcon = () => (
  <Svg>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v10h4v-6h4v6h4V10" />
  </Svg>
)

export const TrashIcon = () => (
  <Svg>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
)

/** Small crescent marking "asleep there" on a tile that your working hours have turned green. */
export const MoonIcon = ({ size = 10 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    fill="currentColor"
  >
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
)

/** Small pennant marking a public holiday on a tile (a shape, so it does not rely on colour). */
export const HolidayIcon = ({ size = 10 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    fill="currentColor"
  >
    <path d="M4 3h2.4v18H4z" />
    <path d="M8 4h12l-3.6 4.6L20 13.2H8z" />
  </svg>
)

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'title'> {
  /** Accessible name and tooltip — an icon alone is not a label. */
  label: string
  danger?: boolean
}

/** A compact icon-only button. The label is both its accessible name and its tooltip. */
export function IconButton({
  label,
  danger = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={['icon-btn', danger ? 'is-danger' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  )
}

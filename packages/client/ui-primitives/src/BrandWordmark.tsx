/** LasmeX wordmark with the compact LX mark. */

import type { IconProps } from './icons/props.ts'

/**
 * Render the full LasmeX wordmark.
 * @param props.size - height in px.
 * @param props.className - extra class for layout placement.
 * @returns the decorative wordmark SVG.
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={(size * 112) / 24}
      height={size}
      className={className}
      viewBox="0 0 112 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M1 3H5V17H10V21H1V3Z" fill="currentColor" />
      <path d="M10 3H14.4L16.5 8L18.6 3H23L18.8 12L23 21H18.6L16.5 16L14.4 21H10L14.2 12L10 3Z" fill="currentColor" />
      <text
        x="29"
        y="17.5"
        fill="currentColor"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="-0.45"
      >
        LasmeX
      </text>
    </svg>
  )
}

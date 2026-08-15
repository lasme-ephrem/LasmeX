/** Compact LasmeX LX mark used by narrow and hero layouts. */

import type { IconProps } from './icons/props.ts'

/**
 * Render the LasmeX LX mark.
 * @param props.size - square size in px.
 * @param props.className - extra class for layout placement.
 * @returns the decorative logo SVG.
 */
export function LasmexMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 3H6V17H11V21H2V3Z" fill="currentColor" />
      <path d="M11 3H15.4L17.5 8L19.6 3H24L19.8 12L24 21H19.6L17.5 16L15.4 21H11L15.2 12L11 3Z" fill="currentColor" />
    </svg>
  )
}

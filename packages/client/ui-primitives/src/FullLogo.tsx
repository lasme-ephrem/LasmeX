/** Full LasmeX logo (cube mark, wordmark, slogan) as the validated exact-transparent embedded raster. */

import { FULL_LOGO_DATA, FULL_LOGO_HEIGHT, FULL_LOGO_WIDTH } from './fullLogoImage.ts'
import type { IconProps } from './icons/props.ts'

/**
 * Render the full LasmeX logo (pixel-exact embedded PNG).
 * @param props.size - rendered height in px; the aspect ratio is preserved.
 * @param props.className - extra class for layout placement.
 * @returns the full-logo SVG.
 */
export function FullLogo({ size = 44, className }: IconProps) {
  return (
    <svg
      width={Math.round((size * FULL_LOGO_WIDTH) / FULL_LOGO_HEIGHT)}
      height={size}
      viewBox={`0 0 ${FULL_LOGO_WIDTH} ${FULL_LOGO_HEIGHT}`}
      className={className}
      aria-hidden="true"
    >
      <image width={FULL_LOGO_WIDTH} height={FULL_LOGO_HEIGHT} href={FULL_LOGO_DATA} />
    </svg>
  )
}

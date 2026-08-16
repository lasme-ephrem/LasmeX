/** Full LasmeX logo (cube mark, wordmark, slogan) as traced vector paths. */

import { FULL_LOGO_HEIGHT, FULL_LOGO_WIDTH, fullLogoPaths } from './fullLogoPaths.ts'
import type { IconProps } from './icons/props.ts'

/**
 * Render the full LasmeX logo from traced vector paths.
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
      {fullLogoPaths.map((path, index) => (
        <path key={index} d={path.d} fill={path.fill} />
      ))}
    </svg>
  )
}

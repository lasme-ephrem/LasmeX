/** LasmeX cube mark as the validated exact-transparent embedded raster. */

import { CUBE_MARK_DATA, CUBE_MARK_HEIGHT, CUBE_MARK_WIDTH } from './cubeMarkImage.ts'
import type { IconProps } from './icons/props.ts'

/**
 * Render the LasmeX cube mark (pixel-exact embedded PNG).
 * @param props.size - rendered height in px; the aspect ratio is preserved.
 * @param props.className - extra class for layout placement.
 * @returns the cube-mark SVG.
 */
export function CubeMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={Math.round((size * CUBE_MARK_WIDTH) / CUBE_MARK_HEIGHT)}
      height={size}
      viewBox={`0 0 ${CUBE_MARK_WIDTH} ${CUBE_MARK_HEIGHT}`}
      className={className}
      aria-hidden="true"
    >
      <image width={CUBE_MARK_WIDTH} height={CUBE_MARK_HEIGHT} href={CUBE_MARK_DATA} />
    </svg>
  )
}

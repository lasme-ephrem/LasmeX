/** LasmeX cube mark as traced vector paths. */

import { CUBE_MARK_HEIGHT, CUBE_MARK_WIDTH, cubeMarkPaths } from './cubeMarkPaths.ts'
import type { IconProps } from './icons/props.ts'

/**
 * Render the LasmeX cube mark from traced vector paths.
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
      {cubeMarkPaths.map((path, index) => (
        <path key={index} d={path.d} fill={path.fill} />
      ))}
    </svg>
  )
}

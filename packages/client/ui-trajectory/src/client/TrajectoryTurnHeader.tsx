// TrajectoryTurnHeader: sticky per-turn bar with Input/Output/Think/Time labels.

import css from './TrajectoryTurnHeader.module.css'
import type { TrajectoryTranslate } from './locales.ts'

export interface TrajectoryTurnHeaderProps {
  /** 1-based turn index shown as `Turn N`. */
  turn: number
  /** Active trajectory dictionary translator. */
  t: TrajectoryTranslate
}

/**
 * Render the sticky turn header row.
 * @param props.turn - turn index.
 * @returns the sticky header element.
 */
export function TrajectoryTurnHeader({ turn, t }: TrajectoryTurnHeaderProps) {
  const columns = [
    t('column.input'), t('column.output'), t('column.reasoning'), t('column.time'),
  ]
  return (
    <div className={css.root}>
      <div className={css.inner}>
        <span className={css.title}>{t('group.turn', { turn })}</span>
        <div className={css.columns} aria-hidden="true">
          {columns.map(label => (
            <span key={label} className={css.column}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

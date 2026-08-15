import type { TrajectoryKey, TrajectoryTranslate } from '../src/client/locales.ts'
import { en, fr, zh } from '../src/client/locales.ts'

function testTranslator(dictionary: Record<TrajectoryKey, string>): TrajectoryTranslate {
  return (key, params) => {
    let result = (dictionary as Partial<Record<string, string>>)[key] ?? key
    for (const [name, value] of Object.entries(params ?? {})) {
      result = result.replaceAll(`{${name}}`, String(value))
    }
    return result
  }
}

/** English trajectory translator for component tests outside the locale plugin. */
export const tEn = testTranslator(en)

/** French trajectory translator for component localization tests. */
export const tFr = testTranslator(fr)

/** Simplified Chinese trajectory translator for component localization tests. */
export const tZh = testTranslator(zh)

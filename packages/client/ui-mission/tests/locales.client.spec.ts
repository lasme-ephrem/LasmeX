import { describe, expect, it } from 'vitest'
import { en, fr, zh } from '../src/client/locales.ts'

describe('mission locales', () => {
  it('ships complete French, English, and Simplified Chinese dictionaries', () => {
    expect(Object.keys(en)).toEqual(Object.keys(fr))
    expect(Object.keys(zh)).toEqual(Object.keys(fr))
    expect(fr['title']).toBe('Tableau de mission')
    expect(en['title']).toBe('Mission dashboard')
    expect(zh['title']).toBe('任务仪表板')
  })
})

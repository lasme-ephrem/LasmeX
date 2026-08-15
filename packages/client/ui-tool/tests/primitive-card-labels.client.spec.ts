import { describe, expect, it } from 'vitest'
import { makeTranslate } from 'lasmex-client-test-runtime'
import { fr as commonFr } from 'lasmex-client-locale/src/locales/fr.ts'
import { fr } from 'lasmex-client-ui-conversation/src/client/locales.ts'
import {
  diffBlockLabels,
  readBlockLabels,
  searchBlockLabels,
  webBlockLabels,
} from '../src/client/tool/models/primitive-card-labels.ts'

const t = makeTranslate(fr, commonFr)

describe('localized structured-card labels', () => {
  it('supplies complete French labels to every generic Tool card', () => {
    const diff = diffBlockLabels(t)
    expect(diff.fileCount(1)).toBe('1 fichier')
    expect(diff.fileCount(2)).toBe('2 fichiers')
    expect(diff.expandAria(3)).toBe('Développer les 3 lignes de modification restantes')

    const read = readBlockLabels(t)
    expect(read.showing(4, 12)).toBe('4 lignes affichées sur 12')
    expect(read.copied).toBe('Copié')

    const search = searchBlockLabels(t)
    expect(search.pathsSummary(2, 20, true)).toBe('2 chemins affichés sur 20')
    expect(search.matchesSummary(3, 30, 2, true)).toBe('3 correspondances affichées sur 30 · 2 fichiers')
    expect(search.empty).toBe('Aucun résultat')

    const web = webBlockLabels(t)
    expect(web.noResults).toBe('Aucun résultat trouvé')
    expect(web.sourcesTruncated).toBe('Liste des sources tronquée')
    expect(web.markdown?.footnotesLabel).toBe('Notes de bas de page')
  })
})

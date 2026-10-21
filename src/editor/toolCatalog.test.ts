import { describe, expect, it } from 'vitest'
import { entryIdOf, toolCategories } from './toolCatalog'

describe('toolCategories', () => {
  const entries = toolCategories().flatMap((category) => category.entries)

  it('一覧の項目の名前は重ならない', () => {
    const ids = entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('道具を選ぶ項目は、選んだあと一覧の同じ項目が選ばれた状態として示される', () => {
    for (const entry of entries) {
      if ('tool' in entry.run) expect(entryIdOf(entry.run.tool)).toBe(entry.id)
    }
  })
})

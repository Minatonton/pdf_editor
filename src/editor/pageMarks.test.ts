import { describe, expect, it } from 'vitest'
import { expandMark } from './pageMarks'

describe('expandMark', () => {
  it('{n} をページ番号に、{total} を総ページ数に置き換える', () => {
    expect(expandMark('{n} / {total}', 3, 12)).toBe('3 / 12')
  })

  it('同じ置き換え文字が何度出てきても、すべて置き換える', () => {
    expect(expandMark('p.{n} (p.{n})', 2, 5)).toBe('p.2 (p.2)')
  })
})

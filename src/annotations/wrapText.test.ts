import { describe, expect, it } from 'vitest'
import { wrapText } from './wrapText'

/** どの文字も幅 1 として測る */
const measure = (text: string) => [...text].length

describe('wrapText', () => {
  it('和文は1文字ずつ、幅に収まるところで折り返す', () => {
    expect(wrapText('あいうえおかきくけこ', 4, measure)).toEqual(['あいうえ', 'おかきく', 'けこ'])
  })

  it('英単語は途中で切らず、単語の切れ目で折り返す', () => {
    expect(wrapText('hello big world', 9, measure)).toEqual(['hello big', 'world'])
  })

  it('句読点や閉じ括弧は行の頭に来ないよう、前の行にぶら下げる', () => {
    expect(wrapText('あいうえ。かき', 4, measure)).toEqual(['あいうえ。', 'かき'])
  })

  it('1語で幅を超える英単語は、文字の途中で切る', () => {
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('打った改行はそのまま行を分ける', () => {
    expect(wrapText('あい\nう', 10, measure)).toEqual(['あい', 'う'])
  })
})

import { describe, expect, it } from 'vitest'
import { groupIntoLines, runFromItem, type Matrix, type TextRun } from './textRuns'

/** A4 縦のページを拡大率 1 で表示したときの viewport の変換（上下を反転して原点を左上へ） */
const A4_VIEWPORT: Matrix = [1, 0, 0, -1, 0, 842]

describe('runFromItem', () => {
  it('PDF の座標の文字を、画面の左上を原点とする位置に直す', () => {
    const run = runFromItem({ str: 'Hello', transform: [12, 0, 0, 12, 100, 742], width: 30 }, A4_VIEWPORT)
    expect(run).toMatchObject({ text: 'Hello', fontSize: 12, baseline: 100, x: 100, width: 30 })
    expect(run!.y).toBeCloseTo(100 - 12 * 0.9)
  })

  it('空白だけの断片は扱わない', () => {
    expect(runFromItem({ str: '  ', transform: [12, 0, 0, 12, 0, 0], width: 5 }, A4_VIEWPORT)).toBeNull()
  })

  it('画面で横書きになっていない文字は扱わない', () => {
    expect(runFromItem({ str: '縦', transform: [0, 12, -12, 0, 100, 100], width: 12 }, A4_VIEWPORT)).toBeNull()
  })
})

function run(text: string, x: number, baseline: number, width: number, fontSize = 10): TextRun {
  return { text, x, baseline, width, fontSize, y: baseline - fontSize * 0.9, height: fontSize * 1.15 }
}

describe('groupIntoLines', () => {
  it('同じ基準線に詰めて並ぶ断片は1行にまとめ、英単語の間には空白を補う', () => {
    const [line] = groupIntoLines([run('world', 42, 100, 25), run('Hello', 10, 100, 28)])
    expect(line).toMatchObject({ text: 'Hello world', x: 10, width: 57 })
  })

  it('和文の断片の間には空白を入れない', () => {
    expect(groupIntoLines([run('申込', 10, 100, 20), run('書', 33, 100, 10)])[0].text).toBe('申込書')
  })

  it('基準線が違う断片は別の行にする', () => {
    expect(groupIntoLines([run('1行目', 10, 100, 30), run('2行目', 10, 114, 30)]).map((l) => l.text)).toEqual(['1行目', '2行目'])
  })

  it('同じ高さでも、間が大きく空いていれば表の別の列とみなして分ける', () => {
    expect(groupIntoLines([run('氏名', 10, 100, 20), run('山田', 200, 100, 20)])).toHaveLength(2)
  })
})

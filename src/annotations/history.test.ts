import { describe, expect, it } from 'vitest'
import { EMPTY_HISTORY, historyReducer, type History, type HistoryAction } from './history'
import type { ImageAnnotation, TextAnnotation } from './types'

const text: TextAnnotation = { id: 't', kind: 'text', pageIndex: 0, x: 10, y: 20, text: 'こんにちは', fontSize: 16, color: '#111111' }
const image: ImageAnnotation = {
  id: 'i',
  kind: 'image',
  pageIndex: 1,
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  bytes: new Uint8Array(),
  format: 'png',
}

function run(...actions: HistoryAction[]): History {
  return actions.reduce(historyReducer, EMPTY_HISTORY)
}

describe('配置した要素の編集', () => {
  it('移動は今の位置からの差分で反映する', () => {
    const { present } = run({ type: 'add', annotation: text }, { type: 'move', id: 't', dx: 5, dy: -10 })
    expect(present[0]).toMatchObject({ x: 15, y: 10 })
  })

  it('画像の大きさを変えても縦横比は保つ', () => {
    const { present } = run({ type: 'add', annotation: image }, { type: 'resizeImage', id: 'i', width: 100 })
    expect(present[0]).toMatchObject({ width: 100, height: 50 })
  })

  it('画像は見失わないよう、一定より小さくはできない', () => {
    const { present } = run({ type: 'add', annotation: image }, { type: 'resizeImage', id: 'i', width: 0 })
    expect(present[0]).toMatchObject({ width: 8, height: 4 })
  })

  it('削除すると、その要素だけがなくなる', () => {
    const { present } = run({ type: 'add', annotation: text }, { type: 'add', annotation: image }, { type: 'remove', id: 't' })
    expect(present.map((a) => a.id)).toEqual(['i'])
  })
})

describe('元に戻す・やり直す', () => {
  it('元に戻すと直前の状態に戻り、やり直すと戻した操作が再び反映される', () => {
    const moved = run({ type: 'add', annotation: text }, { type: 'move', id: 't', dx: 5, dy: 0 })
    const undone = historyReducer(moved, { type: 'undo' })
    expect(undone.present[0]).toMatchObject({ x: 10 })
    expect(historyReducer(undone, { type: 'redo' }).present[0]).toMatchObject({ x: 15 })
  })

  it('元に戻したあとに別の操作をすると、やり直しの候補は消える', () => {
    const history = run(
      { type: 'add', annotation: text },
      { type: 'move', id: 't', dx: 5, dy: 0 },
      { type: 'undo' },
      { type: 'move', id: 't', dx: 0, dy: 5 },
    )
    expect(history.future).toEqual([])
  })

  it('戻す操作がなければ何も変わらない', () => {
    expect(historyReducer(EMPTY_HISTORY, { type: 'undo' })).toBe(EMPTY_HISTORY)
    expect(historyReducer(EMPTY_HISTORY, { type: 'redo' })).toBe(EMPTY_HISTORY)
  })

  it('同じテキストを続けて書き換えたぶんは、1回で元に戻る', () => {
    const history = run(
      { type: 'add', annotation: text },
      { type: 'editText', id: 't', changes: { text: 'こ' } },
      { type: 'editText', id: 't', changes: { text: 'これ' } },
      { type: 'editText', id: 't', changes: { fontSize: 24 } },
      { type: 'undo' },
    )
    expect(history.present[0]).toMatchObject({ text: 'こんにちは', fontSize: 16 })
  })

  it('別の操作を挟んだテキストの編集は、別々に元に戻る', () => {
    const history = run(
      { type: 'add', annotation: text },
      { type: 'editText', id: 't', changes: { text: 'A' } },
      { type: 'move', id: 't', dx: 1, dy: 0 },
      { type: 'editText', id: 't', changes: { text: 'B' } },
      { type: 'undo' },
    )
    expect(history.present[0]).toMatchObject({ text: 'A', x: 11 })
  })
})

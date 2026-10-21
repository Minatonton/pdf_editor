import { describe, expect, it } from 'vitest'
import { EMPTY_HISTORY, editorReducer, type EditorAction, type History, type PageRef } from './document'
import type { ImageAnnotation, RectAnnotation, TextAnnotation } from '../annotations/types'

const text: TextAnnotation = { id: 't', kind: 'text', pageId: 'p1', x: 10, y: 20, text: 'こんにちは', fontSize: 16, color: '#111111' }
const image: ImageAnnotation = {
  id: 'i',
  kind: 'image',
  pageId: 'p2',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  bytes: new Uint8Array(),
  format: 'png',
}

function run(...actions: EditorAction[]): History {
  return actions.reduce(editorReducer, EMPTY_HISTORY)
}

describe('配置した要素の編集', () => {
  it('移動は今の位置からの差分で反映する', () => {
    const { present: { annotations: present } } = run({ type: 'add', annotation: text }, { type: 'move', id: 't', dx: 5, dy: -10 })
    expect(present[0]).toMatchObject({ x: 15, y: 10 })
  })

  it('画像の大きさを変えても縦横比は保つ', () => {
    const { present: { annotations: present } } = run({ type: 'add', annotation: image }, { type: 'resize', id: 'i', width: 100, height: 999 })
    expect(present[0]).toMatchObject({ width: 100, height: 50 })
  })

  it('画像は見失わないよう、一定より小さくはできない', () => {
    const { present: { annotations: present } } = run({ type: 'add', annotation: image }, { type: 'resize', id: 'i', width: 0, height: 0 })
    expect(present[0]).toMatchObject({ width: 8, height: 4 })
  })

  it('四角は縦と横を別々に変えられ、どちらも一定より小さくはできない', () => {
    const rect: RectAnnotation = { id: 'r', kind: 'rect', pageId: 'p1', x: 0, y: 0, width: 50, height: 50, color: '#ffffff', opacity: 1 }
    const { present } = run({ type: 'add', annotation: rect }, { type: 'resize', id: 'r', width: 120, height: 2 })
    expect(present.annotations[0]).toMatchObject({ width: 120, height: 8 })
  })

  it('削除すると、その要素だけがなくなる', () => {
    const { present: { annotations: present } } = run({ type: 'add', annotation: text }, { type: 'add', annotation: image }, { type: 'remove', id: 't' })
    expect(present.map((a) => a.id)).toEqual(['i'])
  })
})

describe('元に戻す・やり直す', () => {
  it('元に戻すと直前の状態に戻り、やり直すと戻した操作が再び反映される', () => {
    const moved = run({ type: 'add', annotation: text }, { type: 'move', id: 't', dx: 5, dy: 0 })
    const undone = editorReducer(moved, { type: 'undo' })
    expect(undone.present.annotations[0]).toMatchObject({ x: 10 })
    expect(editorReducer(undone, { type: 'redo' }).present.annotations[0]).toMatchObject({ x: 15 })
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
    expect(editorReducer(EMPTY_HISTORY, { type: 'undo' })).toBe(EMPTY_HISTORY)
    expect(editorReducer(EMPTY_HISTORY, { type: 'redo' })).toBe(EMPTY_HISTORY)
  })

  it('まとめて置いたものは、1回で元に戻る', () => {
    const history = run({ type: 'addMany', annotations: [text, image] }, { type: 'undo' })
    expect(history.present.annotations).toEqual([])
  })

  it('同じテキストを続けて書き換えたぶんは、1回で元に戻る', () => {
    const history = run(
      { type: 'add', annotation: text },
      { type: 'editText', id: 't', changes: { text: 'こ' } },
      { type: 'editText', id: 't', changes: { text: 'これ' } },
      { type: 'editText', id: 't', changes: { fontSize: 24 } },
      { type: 'undo' },
    )
    expect(history.present.annotations[0]).toMatchObject({ text: 'こんにちは', fontSize: 16 })
  })

  it('別の操作を挟んだテキストの編集は、別々に元に戻る', () => {
    const history = run(
      { type: 'add', annotation: text },
      { type: 'editText', id: 't', changes: { text: 'A' } },
      { type: 'move', id: 't', dx: 1, dy: 0 },
      { type: 'editText', id: 't', changes: { text: 'B' } },
      { type: 'undo' },
    )
    expect(history.present.annotations[0]).toMatchObject({ text: 'A', x: 11 })
  })
})

describe('ページの整理', () => {
  const page = (id: string): PageRef => ({ id, file: 0, index: 0, rotation: 0, width: 600, height: 800 })
  const opened = (...ids: string[]) => editorReducer(EMPTY_HISTORY, { type: 'open', pages: ids.map(page) })
  const order = (history: History) => history.present.pages.map((p) => p.id)

  it('選んだページを、残りの並びの指定した位置へまとめて移す', () => {
    const history = editorReducer(opened('a', 'b', 'c', 'd'), { type: 'movePages', ids: ['d', 'b'], index: 0 })
    expect(order(history)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('並びが変わらない移動は、元に戻す履歴に残さない', () => {
    const start = opened('a', 'b')
    expect(editorReducer(start, { type: 'movePages', ids: ['a'], index: 0 })).toBe(start)
  })

  it('ページを消すと、そのページに置いたものも消える', () => {
    const history = [
      { type: 'add', annotation: { ...text, pageId: 'a' } },
      { type: 'removePages', ids: ['a'] },
    ].reduce((h, a) => editorReducer(h, a as EditorAction), opened('a', 'b'))
    expect(order(history)).toEqual(['b'])
    expect(history.present.annotations).toEqual([])
  })

  it('すべてのページは消せない', () => {
    const start = opened('a', 'b')
    expect(editorReducer(start, { type: 'removePages', ids: ['a', 'b'] })).toBe(start)
  })

  it('指定した位置にページを差し込む', () => {
    const history = editorReducer(opened('a', 'b'), { type: 'insertPages', pages: [page('x')], index: 1 })
    expect(order(history)).toEqual(['a', 'x', 'b'])
  })

  it('ページを回すと向きが変わり、置いた画像は紙の同じ場所に留まる', () => {
    const placed: ImageAnnotation = { ...image, pageId: 'a', x: 0, y: 0, width: 100, height: 50 }
    const history = [
      { type: 'add', annotation: placed },
      { type: 'rotatePages', ids: ['a'], degrees: 90 },
    ].reduce((h, a) => editorReducer(h, a as EditorAction), opened('a'))
    expect(history.present.pages[0].rotation).toBe(90)
    // 左上の角にあった中心 (50, 25) は、右に90度回すと右上の角の (800 - 25, 50) に来る（回したあとの幅は 800）
    expect(history.present.annotations[0]).toMatchObject({ x: 775 - 50, y: 50 - 25, width: 100, height: 50 })
  })

  it('左に回したあと右に回すと、置いたものも元の位置に戻る', () => {
    const history = [
      { type: 'add', annotation: { ...text, pageId: 'a' } },
      { type: 'rotatePages', ids: ['a'], degrees: -90 },
      { type: 'rotatePages', ids: ['a'], degrees: 90 },
    ].reduce((h, a) => editorReducer(h, a as EditorAction), opened('a'))
    expect(history.present.pages[0].rotation).toBe(0)
    expect(history.present.annotations[0]).toMatchObject({ x: text.x, y: text.y })
  })
})

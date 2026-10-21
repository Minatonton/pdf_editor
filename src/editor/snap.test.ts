import { describe, expect, it } from 'vitest'
import { linesOfBox, snap } from './snap'

describe('snap', () => {
  it('近くにある線に、一番近い線どうしを合わせる', () => {
    const moving = linesOfBox({ x: 98, y: 50, width: 40, height: 20 })
    expect(snap(moving, { xs: [{ at: 100, kind: 'edge' }], ys: [] }, 5)).toEqual({ dx: 2, dy: 0, guides: [{ axis: 'x', at: 100 }] })
  })

  it('縦と横は別々に合わせる', () => {
    const moving = linesOfBox({ x: 10, y: 10, width: 20, height: 20 })
    const snapped = snap(moving, { xs: [{ at: 33, kind: 'edge' }], ys: [{ at: 18, kind: 'center' }] }, 4)
    expect(snapped).toMatchObject({ dx: 3, dy: -2 })
    expect(snapped.guides).toHaveLength(2)
  })

  it('離れすぎている線には合わせない', () => {
    expect(snap(linesOfBox({ x: 0, y: 0, width: 10, height: 10 }), { xs: [{ at: 30, kind: 'edge' }], ys: [{ at: 30, kind: 'edge' }] }, 5)).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('文字は基準線を、元の文字の行の基準線に合わせられる', () => {
    const moving = linesOfBox({ x: 0, y: 100, width: 50, height: 22 }, 117)
    expect(snap(moving, { xs: [], ys: [{ at: 119, kind: 'baseline' }] }, 3)).toMatchObject({ dy: 2, guides: [{ axis: 'y', at: 119 }] })
  })

  it('中央は元の行の基準線に合わせない。文字が線より浮いて見えるため', () => {
    // 中央は 111、基準線は 117。基準線 112 に近いのは中央だが、合わせるのは基準線のほう
    const moving = linesOfBox({ x: 0, y: 100, width: 50, height: 22 }, 117)
    expect(snap(moving, { xs: [], ys: [{ at: 112, kind: 'baseline' }] }, 6)).toMatchObject({ dy: -5 })
  })

  it('署名の画像の下端を、元の行の基準線（下線）に合わせられる', () => {
    const moving = linesOfBox({ x: 0, y: 70, width: 100, height: 40 })
    expect(snap(moving, { xs: [], ys: [{ at: 112, kind: 'baseline' }] }, 3)).toMatchObject({ dy: 2 })
  })
})

import { describe, expect, it } from 'vitest'
import { normalizeRotation, pdfToViewPoint, placeInPdf, viewSize, viewToPdfPoint, type PageBox } from './geometry'

const A4: PageBox = { left: 0, bottom: 0, right: 595, top: 842 }

describe('normalizeRotation', () => {
  it('負の角度や360度以上も 0〜270 にそろえる', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
  })

  it('90度単位でない回転はエラーになる', () => {
    expect(() => normalizeRotation(45)).toThrow()
  })
})

describe('viewSize', () => {
  it('横向きに回したページは幅と高さが入れ替わる', () => {
    expect(viewSize(A4, 0)).toEqual({ width: 595, height: 842 })
    expect(viewSize(A4, 90)).toEqual({ width: 842, height: 595 })
  })
})

describe('viewToPdfPoint', () => {
  it('回転なしでは、画面の左上がページの左上になる', () => {
    expect(viewToPdfPoint(0, 0, A4, 0)).toEqual({ x: 0, y: 842 })
    expect(viewToPdfPoint(100, 200, A4, 0)).toEqual({ x: 100, y: 642 })
  })

  it('原点がずれたページでも、表示範囲の左上を基準にする', () => {
    const offset: PageBox = { left: 10, bottom: 20, right: 110, top: 220 }
    expect(viewToPdfPoint(0, 0, offset, 0)).toEqual({ x: 10, y: 220 })
  })

  it.each([
    [90, { x: 0, y: 0 }],
    [180, { x: 595, y: 0 }],
    [270, { x: 595, y: 842 }],
  ] as const)('%i度回転したページでは、画面の左上がページのその角になる', (rotation, corner) => {
    expect(viewToPdfPoint(0, 0, A4, rotation)).toEqual(corner)
  })

  it.each([0, 90, 180, 270] as const)('%i度回転でも、画面の右下はページの対角になる', (rotation) => {
    const { width, height } = viewSize(A4, rotation)
    const topLeft = viewToPdfPoint(0, 0, A4, rotation)
    const bottomRight = viewToPdfPoint(width, height, A4, rotation)
    expect(bottomRight).toEqual({ x: 595 - topLeft.x, y: 842 - topLeft.y })
  })
})

describe('pdfToViewPoint', () => {
  it.each([0, 90, 180, 270] as const)('%i度回転でも、画面の座標に戻すと元の点になる', (rotation) => {
    const pdf = viewToPdfPoint(120, 340, A4, rotation)
    expect(pdfToViewPoint(pdf.x, pdf.y, A4, rotation)).toEqual({ x: 120, y: 340 })
  })
})

describe('placeInPdf', () => {
  it('回転なしでは、画面上の左下の角に置き、回さない', () => {
    expect(placeInPdf({ x: 50, y: 100, width: 200, height: 80 }, A4, 0)).toEqual({
      x: 50,
      y: 662,
      width: 200,
      height: 80,
      rotateDegrees: 0,
    })
  })

  it('90度回転したページでは、ページの回転と同じだけ反時計回りに回して正立させる', () => {
    expect(placeInPdf({ x: 50, y: 100, width: 200, height: 80 }, A4, 90)).toEqual({
      x: 180,
      y: 50,
      width: 200,
      height: 80,
      rotateDegrees: 90,
    })
  })
})

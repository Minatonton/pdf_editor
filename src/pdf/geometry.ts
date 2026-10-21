export type Rotation = 0 | 90 | 180 | 270

/** PDF のページ座標（左下が原点、単位はポイント）での表示範囲 */
export interface PageBox {
  left: number
  bottom: number
  right: number
  top: number
}

/** 画面に見えている向きでの矩形（左上が原点、単位はポイント） */
export interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

/** pdf-lib の drawImage にそのまま渡せる配置 */
export interface PdfPlacement {
  x: number
  y: number
  width: number
  height: number
  rotateDegrees: number
}

export function normalizeRotation(degrees: number): Rotation {
  const normalized = ((degrees % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) return normalized
  throw new Error(`ページの回転が90度単位ではありません: ${degrees}`)
}

export function viewSize(box: PageBox, rotation: Rotation): { width: number; height: number } {
  const width = box.right - box.left
  const height = box.top - box.bottom
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

/** ページの /Rotate は表示時に時計回りに回すという指定なので、その逆をたどって PDF 座標に戻す */
export function viewToPdfPoint(vx: number, vy: number, box: PageBox, rotation: Rotation): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: box.left + vx, y: box.top - vy }
    case 90:
      return { x: box.left + vy, y: box.bottom + vx }
    case 180:
      return { x: box.right - vx, y: box.bottom + vy }
    case 270:
      return { x: box.right - vy, y: box.top - vx }
  }
}

export function pdfToViewPoint(px: number, py: number, box: PageBox, rotation: Rotation): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: px - box.left, y: box.top - py }
    case 90:
      return { x: py - box.bottom, y: px - box.left }
    case 180:
      return { x: box.right - px, y: py - box.bottom }
    case 270:
      return { x: box.top - py, y: box.right - px }
  }
}

export function placeInPdf(rect: ViewRect, box: PageBox, rotation: Rotation): PdfPlacement {
  // drawImage は画像の左下を基準に反時計回りに回すので、画面上の左下の角を基準点にし、
  // 表示時の時計回りの回転と打ち消し合う角度だけ回す
  const anchor = viewToPdfPoint(rect.x, rect.y + rect.height, box, rotation)
  return { x: anchor.x, y: anchor.y, width: rect.width, height: rect.height, rotateDegrees: rotation }
}

/**
 * 画面上の中心の位置に、幅 width・高さ height のものを、画面に対して反時計回りに tilt 度傾けて置く配置。
 * drawImage は左下の角を軸に回すので、回したあとの中心が狙った位置に来るよう、左下の角をずらす
 */
export function placeCenteredInPdf(
  center: Point,
  width: number,
  height: number,
  tilt: number,
  box: PageBox,
  rotation: Rotation,
): PdfPlacement {
  const c = viewToPdfPoint(center.x, center.y, box, rotation)
  const degrees = rotation + tilt
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfW = width / 2
  const halfH = height / 2
  return {
    x: c.x - (halfW * cos - halfH * sin),
    y: c.y - (halfW * sin + halfH * cos),
    width,
    height,
    rotateDegrees: degrees,
  }
}

export interface Point {
  x: number
  y: number
}

export function boundsOf(points: Point[]): ViewRect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
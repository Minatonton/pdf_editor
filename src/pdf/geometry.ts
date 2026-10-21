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

export function placeInPdf(rect: ViewRect, box: PageBox, rotation: Rotation): PdfPlacement {
  // drawImage は画像の左下を基準に反時計回りに回すので、画面上の左下の角を基準点にし、
  // 表示時の時計回りの回転と打ち消し合う角度だけ回す
  const anchor = viewToPdfPoint(rect.x, rect.y + rect.height, box, rotation)
  return { x: anchor.x, y: anchor.y, width: rect.width, height: rect.height, rotateDegrees: rotation }
}

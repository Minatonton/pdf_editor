export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** ボタンやキーで1段ずつ変えるときの次の倍率。段の途中にいるときは、向かう側の最寄りの段に合わせる */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0 ? ZOOM_STEPS.find((step) => step > zoom + 1e-6) : ZOOM_STEPS.findLast((step) => step < zoom - 1e-6)
  return next ?? clampZoom(zoom)
}

/** 一番幅の広いページが、表示する場所の幅にちょうど収まる倍率 */
export function fitWidthZoom(availableWidth: number, pageWidths: number[]): number {
  const widest = Math.max(...pageWidths)
  return clampZoom(availableWidth / widest)
}

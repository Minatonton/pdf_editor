/** 中心から指への向き。真上を 0 度とし、時計回りに増える（画面の見た目どおり） */
export function angleFrom(center: { x: number; y: number }, pointer: { x: number; y: number }): number {
  const degrees = (Math.atan2(pointer.x - center.x, center.y - pointer.y) * 180) / Math.PI
  return (degrees + 360) % 360
}

/** 真っすぐ（0・90・180・270 度）の近くでは吸い寄せる。斜めにしたつもりのないものが、わずかに傾いて残らないように */
const STRAIGHT_SNAP = 4

/**
 * 回した角度をそろえる。steps のとき（Shift を押しているとき）は 15 度刻みにする。
 * 結果は 0〜359 度にそろえ、ほぼ 360 度は 0 度にする
 */
export function snapAngle(degrees: number, steps: boolean): number {
  const step = steps ? 15 : 90
  const nearest = Math.round(degrees / step) * step
  const snapped = steps || Math.abs(degrees - nearest) <= STRAIGHT_SNAP ? nearest : Math.round(degrees)
  return ((snapped % 360) + 360) % 360
}

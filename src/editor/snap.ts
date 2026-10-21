/**
 * 線の種類。中央は中央どうしだけで合わせ、端と文字の基準線は互いに合わせる。
 * 文字の中央を元の行の基準線に合わせると、文字が線より半分浮いて見えるため
 */
export type LineKind = 'edge' | 'center' | 'baseline'

export interface SnapLine {
  at: number
  kind: LineKind
}

/** 吸い寄せる先・動かしているものの線。x は縦の線の位置、y は横の線の位置 */
export interface SnapLines {
  xs: SnapLine[]
  ys: SnapLine[]
}

export interface Guide {
  axis: 'x' | 'y'
  at: number
}

export interface Snapped {
  dx: number
  dy: number
  guides: Guide[]
}

function compatible(a: LineKind, b: LineKind): boolean {
  return (a === 'center') === (b === 'center')
}

function nearest(candidates: SnapLine[], targets: SnapLine[], threshold: number): { offset: number; at: number } | null {
  let best: { offset: number; at: number } | null = null
  for (const candidate of candidates) {
    for (const target of targets) {
      if (!compatible(candidate.kind, target.kind)) continue
      const offset = target.at - candidate.at
      if (Math.abs(offset) <= threshold && (!best || Math.abs(offset) < Math.abs(best.offset))) best = { offset, at: target.at }
    }
  }
  return best
}

/**
 * 動かしているものの線のうち、吸い寄せる先の線に一番近いものを合わせる。
 * 縦と横は別々に合わせ、合わせた位置にガイド線を出す。どちらも threshold より離れていれば動かさない
 */
export function snap(moving: SnapLines, targets: SnapLines, threshold: number): Snapped {
  const x = nearest(moving.xs, targets.xs, threshold)
  const y = nearest(moving.ys, targets.ys, threshold)
  return {
    dx: x?.offset ?? 0,
    dy: y?.offset ?? 0,
    guides: [...(x ? [{ axis: 'x' as const, at: x.at }] : []), ...(y ? [{ axis: 'y' as const, at: y.at }] : [])],
  }
}

/** 箱の左端・中央・右端と、上端・中央・下端。文字なら基準線も足す */
export function linesOfBox(box: { x: number; y: number; width: number; height: number }, baseline?: number): SnapLines {
  return {
    xs: [
      { at: box.x, kind: 'edge' },
      { at: box.x + box.width / 2, kind: 'center' },
      { at: box.x + box.width, kind: 'edge' },
    ],
    ys: [
      { at: box.y, kind: 'edge' },
      { at: box.y + box.height / 2, kind: 'center' },
      { at: box.y + box.height, kind: 'edge' },
      ...(baseline === undefined ? [] : [{ at: baseline, kind: 'baseline' as const }]),
    ],
  }
}

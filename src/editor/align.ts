import type { ViewRect } from '../pdf/geometry'

export type Alignment = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom' | 'distributeX' | 'distributeY'

export interface Move {
  id: string
  dx: number
  dy: number
}

type Box = ViewRect & { id: string }

/**
 * 選んだものを揃える・等間隔に並べるために、それぞれを動かす量。
 * 揃える先は選んだもの全体を囲む箱の端や中央にする（どれか1つに合わせると、どれが基準か迷うため）。
 * 等間隔は両端のものを動かさず、間の隙間をそろえる
 */
export function alignMoves(boxes: Box[], how: Alignment): Move[] {
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  const horizontal = (b: Box, x: number) => ({ id: b.id, dx: x - b.x, dy: 0 })
  const vertical = (b: Box, y: number) => ({ id: b.id, dx: 0, dy: y - b.y })
  switch (how) {
    case 'left':
      return boxes.map((b) => horizontal(b, left))
    case 'centerX':
      return boxes.map((b) => horizontal(b, (left + right) / 2 - b.width / 2))
    case 'right':
      return boxes.map((b) => horizontal(b, right - b.width))
    case 'top':
      return boxes.map((b) => vertical(b, top))
    case 'centerY':
      return boxes.map((b) => vertical(b, (top + bottom) / 2 - b.height / 2))
    case 'bottom':
      return boxes.map((b) => vertical(b, bottom - b.height))
    case 'distributeX': {
      const sorted = [...boxes].sort((p, q) => p.x - q.x)
      const gap = (right - left - sorted.reduce((sum, b) => sum + b.width, 0)) / (sorted.length - 1)
      let x = left
      return sorted.map((b) => {
        const move = horizontal(b, x)
        x += b.width + gap
        return move
      })
    }
    case 'distributeY': {
      const sorted = [...boxes].sort((p, q) => p.y - q.y)
      const gap = (bottom - top - sorted.reduce((sum, b) => sum + b.height, 0)) / (sorted.length - 1)
      let y = top
      return sorted.map((b) => {
        const move = vertical(b, y)
        y += b.height + gap
        return move
      })
    }
  }
}

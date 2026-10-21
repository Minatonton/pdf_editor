import type { ViewRect } from './geometry'

/** 画面の向きでの、元の PDF の1行ぶんの文字。位置と大きさはポイント */
export interface TextRun extends ViewRect {
  text: string
  fontSize: number
  /** 文字の並ぶ基準線の高さ。打ち直した文字をこの線にそろえる */
  baseline: number
}

export type Matrix = [number, number, number, number, number, number]

export interface TextItemLike {
  str: string
  transform: number[]
  width: number
}

/** 字面の上端と下端を、文字の大きさに対する基準線からの距離で見積もる（多くの欧文・和文フォントに合う値） */
const ASCENT = 0.9
const DESCENT = 0.25

function multiply(m: Matrix, n: number[]): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

/**
 * pdf.js の文字の断片を、画面の向き（拡大率 1 の viewport）での位置に直す。
 * 画面で横書きになっていない文字（縦書きや斜めの文字）は、打ち直しても同じ形にできないので扱わない
 */
export function runFromItem(item: TextItemLike, viewport: Matrix): TextRun | null {
  if (item.str.trim() === '') return null
  const [a, b, c, d, e, f] = multiply(viewport, item.transform)
  const fontSize = Math.hypot(c, d)
  if (fontSize === 0 || a <= 0 || Math.abs(b) > a * 0.01) return null
  return {
    text: item.str,
    fontSize,
    baseline: f,
    x: e,
    y: f - fontSize * ASCENT,
    width: item.width,
    height: fontSize * (ASCENT + DESCENT),
  }
}

/** 英数字どうしの間に隙間があるときだけ空白を補う。和文は単語の間に空白を入れないため */
function joiner(left: string, right: string, gap: number, fontSize: number): string {
  return gap > fontSize * 0.2 && /[A-Za-z0-9.,]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? ' ' : ''
}

/**
 * 同じ基準線に並び、間が詰まっている断片を1行にまとめる。
 * 間が文字1つぶんより広く空いているものは、表の別の列などとみなして分ける
 */
export function groupIntoLines(runs: TextRun[]): TextRun[] {
  const sorted = [...runs].sort((p, q) => p.baseline - q.baseline || p.x - q.x)
  const lines: TextRun[] = []
  for (const run of sorted) {
    const line = lines.findLast(
      (candidate) =>
        Math.abs(candidate.baseline - run.baseline) < candidate.fontSize * 0.2 &&
        run.x - (candidate.x + candidate.width) < candidate.fontSize &&
        run.x >= candidate.x,
    )
    if (!line) {
      lines.push({ ...run })
      continue
    }
    const gap = run.x - (line.x + line.width)
    line.text += joiner(line.text, run.text, gap, line.fontSize) + run.text
    const right = Math.max(line.x + line.width, run.x + run.width)
    const top = Math.min(line.y, run.y)
    const bottom = Math.max(line.y + line.height, run.y + run.height)
    Object.assign(line, { y: top, width: right - line.x, height: bottom - top, fontSize: Math.max(line.fontSize, run.fontSize) })
  }
  return lines
}

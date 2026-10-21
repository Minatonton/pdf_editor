import { boundsOf, type Point } from '../pdf/geometry'
import type { ShapeAnnotation } from './types'

/** 円を4つの3次ベジェ曲線で近似するときの制御点の距離 */
const KAPPA = 0.5523

const ARROW_HEAD_ANGLE = Math.PI / 6

/**
 * 図形を、左上を原点・下向きを正とする SVG のパスにする。
 * 画面の表示と PDF への保存（pdf-lib の drawSvgPath）で同じパスを使い、見た目を一致させる
 */
export function shapePath(shape: Pick<ShapeAnnotation, 'variant' | 'width' | 'height' | 'points' | 'strokeWidth'>): string {
  const { width: w, height: h } = shape
  const at = ([x, y]: [number, number]) => [x * w, y * h] as const
  switch (shape.variant) {
    case 'rectangle':
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`
    case 'ellipse': {
      const rx = w / 2
      const ry = h / 2
      const kx = rx * KAPPA
      const ky = ry * KAPPA
      return [
        `M 0 ${ry}`,
        `C 0 ${ry - ky} ${rx - kx} 0 ${rx} 0`,
        `C ${rx + kx} 0 ${w} ${ry - ky} ${w} ${ry}`,
        `C ${w} ${ry + ky} ${rx + kx} ${h} ${rx} ${h}`,
        `C ${rx - kx} ${h} 0 ${ry + ky} 0 ${ry}`,
        'Z',
      ].join(' ')
    }
    case 'line':
    case 'ink':
      return polyline(shape.points.map(at))
    case 'arrow': {
      const points = shape.points.map(at)
      const [x0, y0] = points[0]
      const [x1, y1] = points[points.length - 1]
      const angle = Math.atan2(y1 - y0, x1 - x0)
      const length = Math.max(8, shape.strokeWidth * 4)
      const wing = (side: number) => {
        const a = angle + Math.PI + side * ARROW_HEAD_ANGLE
        return `${x1 + length * Math.cos(a)} ${y1 + length * Math.sin(a)}`
      }
      return `${polyline(points)} M ${wing(1)} L ${x1} ${y1} L ${wing(-1)}`
    }
  }
}

function polyline(points: (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
}

/**
 * 描いた点の並びを、それを囲む箱と、箱に対する割合の点に分ける。
 * 線が水平・垂直だと箱の幅か高さが 0 になるので、そのときは割合を 0 にそろえる
 */
export function normalizePoints(points: Point[]) {
  const { x, y, width, height } = boundsOf(points)
  const ratio = (value: number, origin: number, size: number) => (size === 0 ? 0 : (value - origin) / size)
  return {
    x,
    y,
    width,
    height,
    points: points.map((p) => [ratio(p.x, x, width), ratio(p.y, y, height)] as [number, number]),
  }
}

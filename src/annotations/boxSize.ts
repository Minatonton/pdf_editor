import { MIN_BOX_SIZE, type BoxAnnotation } from './types'

/**
 * 線・矢印・手書きは、水平や垂直に引くと幅か高さが 0 になるのが正しい形なので、最小の大きさを設けない。
 * 面を持つものは、小さくしすぎると選べなくなるので最小の大きさで止める
 */
function minSizeOf(annotation: BoxAnnotation): number {
  return annotation.kind === 'shape' && ['line', 'arrow', 'ink'].includes(annotation.variant) ? 0 : MIN_BOX_SIZE
}

/** 画像は縦横比を保ち、ほかは縦と横を別々に変える */
export function resizeBox(annotation: BoxAnnotation, width: number, height: number): { width: number; height: number } {
  if (annotation.kind === 'image') {
    const imageWidth = Math.max(MIN_BOX_SIZE, width)
    return { width: imageWidth, height: (annotation.height * imageWidth) / annotation.width }
  }
  const min = minSizeOf(annotation)
  return { width: Math.max(min, width), height: Math.max(min, height) }
}

import type { ImageAnnotation } from './types'

export interface LoadedImage {
  bytes: Uint8Array
  format: ImageAnnotation['format']
  pixelWidth: number
  pixelHeight: number
}

/** PDF に埋め込めるのは PNG と JPEG だけなので、それ以外（WebP・GIF など）は PNG に変換する */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file)
  const { width: pixelWidth, height: pixelHeight } = bitmap
  try {
    if (file.type === 'image/png' || file.type === 'image/jpeg') {
      return { bytes: new Uint8Array(await file.arrayBuffer()), format: file.type === 'image/png' ? 'png' : 'jpeg', pixelWidth, pixelHeight }
    }
    const canvas = document.createElement('canvas')
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/png'),
    )
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png', pixelWidth, pixelHeight }
  } finally {
    bitmap.close()
  }
}

export function mimeTypeOf(format: ImageAnnotation['format']): string {
  return format === 'png' ? 'image/png' : 'image/jpeg'
}

/**
 * 白に近い色を透明にする。紙をスキャンした印鑑やサインの画像を、書類の上に重ねても背景が白く浮かないようにする。
 * 境目がギザギザにならないよう、明るさに応じて少しずつ透かす
 */
export async function whiteToTransparent(bytes: Uint8Array, format: ImageAnnotation['format']): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeTypeOf(format) }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.min(data[i + 3], transparentAlpha(data[i], data[i + 1], data[i + 2]))
  }
  context.putImageData(image, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/** TRANSPARENT_ABOVE より明るい色は完全に透明に、OPAQUE_BELOW より暗い色はそのまま残し、間は明るいほど透かす */
const OPAQUE_BELOW = 160
const TRANSPARENT_ABOVE = 235

export function transparentAlpha(r: number, g: number, b: number): number {
  const lightness = Math.min(r, g, b)
  if (lightness >= TRANSPARENT_ABOVE) return 0
  if (lightness <= OPAQUE_BELOW) return 255
  return Math.round((255 * (TRANSPARENT_ABOVE - lightness)) / (TRANSPARENT_ABOVE - OPAQUE_BELOW))
}

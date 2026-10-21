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

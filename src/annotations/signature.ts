import type { LoadedImage } from './imageFile'

export const SEAL_RED = '#c8241b'

async function canvasToImage(canvas: HTMLCanvasElement): Promise<LoadedImage> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png'),
  )
  return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png', pixelWidth: canvas.width, pixelHeight: canvas.height }
}

/** 書いた線の周りの余白を切り落とす。余白ごと置くと、署名欄に合わせて大きさを変えにくいため */
export async function trimmedImage(source: HTMLCanvasElement, margin = 8): Promise<LoadedImage | null> {
  const context = source.getContext('2d')!
  const { data, width, height } = context.getImageData(0, 0, source.width, source.height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) return null
  left = Math.max(0, left - margin)
  top = Math.max(0, top - margin)
  right = Math.min(width - 1, right + margin)
  bottom = Math.min(height - 1, bottom + margin)
  const trimmed = document.createElement('canvas')
  trimmed.width = right - left + 1
  trimmed.height = bottom - top + 1
  trimmed.getContext('2d')!.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height)
  return canvasToImage(trimmed)
}

export async function typedSignature(name: string, font: string, color: string): Promise<LoadedImage | null> {
  const canvas = document.createElement('canvas')
  const size = 96
  const context = canvas.getContext('2d')!
  const fontSpec = `${size}px ${font}`
  await document.fonts.load(fontSpec, name)
  context.font = fontSpec
  canvas.width = Math.ceil(context.measureText(name).width) + 32
  canvas.height = Math.ceil(size * 1.5)
  context.font = fontSpec
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.fillText(name, 16, canvas.height / 2)
  return trimmedImage(canvas)
}

/**
 * 名前から丸い印鑑を作る。1〜2文字は縦に1列、3〜4文字は右の列から縦に読む2列にする（日本の印鑑の並び）
 */
export async function sealImage(name: string): Promise<LoadedImage | null> {
  const chars = [...name.trim()].slice(0, 4)
  if (chars.length === 0) return null
  const size = 360
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const font = "'Hiragino Mincho ProN', 'Yu Mincho', serif"
  await document.fonts.load(`100px ${font}`, name)

  context.strokeStyle = SEAL_RED
  context.fillStyle = SEAL_RED
  context.lineWidth = size * 0.04
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2 - context.lineWidth, 0, Math.PI * 2)
  context.stroke()

  const columns = chars.length <= 2 ? [chars] : [chars.slice(0, Math.ceil(chars.length / 2)), chars.slice(Math.ceil(chars.length / 2))]
  const inner = size * 0.68
  const rows = Math.max(...columns.map((column) => column.length))
  const glyph = Math.min(inner / rows, inner / columns.length)
  context.font = `bold ${glyph * 0.92}px ${font}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  columns.forEach((column, c) => {
    // 縦書きは右の列から読むので、1列目を右に置く
    const x = size / 2 + ((columns.length - 1) / 2 - c) * glyph
    const spacing = inner / column.length
    column.forEach((char, r) => context.fillText(char, x, size / 2 + (r - (column.length - 1) / 2) * spacing))
  })
  return canvasToImage(canvas)
}

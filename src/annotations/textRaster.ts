import type { TextAnnotation } from './types'

export const TEXT_FONT_FAMILY = "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif"
export const TEXT_LINE_HEIGHT = 1.4

/** 印刷しても粗さが目立たない解像度（288dpi 相当） */
const PIXELS_PER_POINT = 4

export interface RasterizedText {
  png: Uint8Array
  width: number
  height: number
}

/**
 * テキストは PDF のフォントとしてではなく、画像にして埋め込む。
 * pdf-lib の標準フォントは日本語を表示できず、日本語フォントを埋め込むと1ファイルあたり数MB増えるうえ、
 * pdf-lib のサブセット化は CFF 形式の日本語フォントで文字化けするため。
 * 代わりに書き出した PDF の文字は選択・検索できない。
 */
export async function rasterizeText(annotation: Pick<TextAnnotation, 'text' | 'fontSize' | 'color'>): Promise<RasterizedText> {
  const font = `${annotation.fontSize}px ${TEXT_FONT_FAMILY}`
  await document.fonts.load(font, annotation.text)

  const lines = annotation.text.split('\n')
  const lineHeight = annotation.fontSize * TEXT_LINE_HEIGHT
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.font = font
  const width = Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const height = lines.length * lineHeight

  canvas.width = Math.ceil(width * PIXELS_PER_POINT)
  canvas.height = Math.ceil(height * PIXELS_PER_POINT)
  // canvas の大きさを変えると描画設定が初期化されるので、ここで設定し直す
  context.scale(PIXELS_PER_POINT, PIXELS_PER_POINT)
  context.font = font
  context.fillStyle = annotation.color
  context.textBaseline = 'middle'
  lines.forEach((line, i) => context.fillText(line, 0, (i + 0.5) * lineHeight))

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('テキストを画像にできませんでした'))), 'image/png'),
  )
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height }
}

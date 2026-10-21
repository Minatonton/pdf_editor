import type { TextAnnotation } from './types'
import { wrapText } from './wrapText'

export const TEXT_FONT_FAMILY = "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif"
export const TEXT_LINE_HEIGHT = 1.4

/** 印刷しても粗さが目立たない解像度（288dpi 相当） */
const PIXELS_PER_POINT = 4

/**
 * 行の上端から基準線までの距離。CSS は行の高さの中にフォントの字面（ascent + descent）を上下中央に置くので、
 * それと同じ計算をして、画面の表示・保存する画像・元の文字の基準線をそろえる
 */
export function baselineOffset(fontSize: number): number {
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `${fontSize}px ${TEXT_FONT_FAMILY}`
  const metrics = context.measureText('あ')
  const ascent = metrics.fontBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent
  return (fontSize * TEXT_LINE_HEIGHT - (ascent + descent)) / 2 + ascent
}

/** 文字の幅（ポイント）。折り返す位置を、画面と保存で同じ計算で決めるために使う */
export function measureText(text: string, fontSize: number): number {
  const context = measuringContext()
  context.font = `${fontSize}px ${TEXT_FONT_FAMILY}`
  return context.measureText(text).width
}

let sharedContext: CanvasRenderingContext2D | undefined
function measuringContext(): CanvasRenderingContext2D {
  sharedContext ??= document.createElement('canvas').getContext('2d')!
  return sharedContext
}

/** 画面と保存する画像で使う行。幅があれば折り返す */
export function linesOf(annotation: Pick<TextAnnotation, 'text' | 'fontSize' | 'width'>): string[] {
  if (annotation.width === undefined) return annotation.text.split('\n')
  return wrapText(annotation.text, annotation.width, (text) => measureText(text, annotation.fontSize))
}

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
export async function rasterizeText(
  annotation: Pick<TextAnnotation, 'text' | 'fontSize' | 'color' | 'width'>,
): Promise<RasterizedText> {
  const font = `${annotation.fontSize}px ${TEXT_FONT_FAMILY}`
  await document.fonts.load(font, annotation.text)

  const lines = linesOf(annotation)
  const lineHeight = annotation.fontSize * TEXT_LINE_HEIGHT
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.font = font
  // 折り返す幅を決めたものは、画面の枠と同じ幅にする。中央を軸に回すとき、画面と同じ中心になるように
  const width = annotation.width ?? Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const height = lines.length * lineHeight

  canvas.width = Math.ceil(width * PIXELS_PER_POINT)
  canvas.height = Math.ceil(height * PIXELS_PER_POINT)
  // canvas の大きさを変えると描画設定が初期化されるので、ここで設定し直す
  context.scale(PIXELS_PER_POINT, PIXELS_PER_POINT)
  context.font = font
  context.fillStyle = annotation.color
  context.textBaseline = 'alphabetic'
  const offset = baselineOffset(annotation.fontSize)
  lines.forEach((line, i) => context.fillText(line, 0, i * lineHeight + offset))

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('テキストを画像にできませんでした'))), 'image/png'),
  )
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height }
}

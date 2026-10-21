/** 位置と大きさは、画面に見えている向きでのページ座標（左上が原点、単位はポイント） */
interface Placed {
  id: string
  pageId: string
  x: number
  y: number
}

export interface TextAnnotation extends Placed {
  kind: 'text'
  text: string
  fontSize: number
  color: string
}

export interface ImageAnnotation extends Placed {
  kind: 'image'
  width: number
  height: number
  bytes: Uint8Array
  format: 'png' | 'jpeg'
}

/**
 * 白塗りとマーカー。上に重ねて見えなくするだけで、下の文字は PDF に残る。
 * そのため「黒塗り」はここには用意せず、中身ごと消す墨消しを別に用意する
 */
export interface RectAnnotation extends Placed {
  kind: 'rect'
  width: number
  height: number
  color: string
  opacity: number
}

/**
 * 墨消し。保存するとき、このページを画像にしてから範囲を黒く塗り、元の文字や画像をファイルから消す。
 * 上に黒い四角を重ねるだけでは、下の文字がコピーや検索で読めてしまうため
 */
export interface RedactionAnnotation extends Placed {
  kind: 'redaction'
  width: number
  height: number
}

export type ShapeVariant = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'ink'

/** 線で描くもの。線・矢印・手書きの点は、幅と高さに対する割合（0〜1）で持ち、大きさを変えても形を保つ */
export interface ShapeAnnotation extends Placed {
  kind: 'shape'
  variant: ShapeVariant
  width: number
  height: number
  points: [number, number][]
  color: string
  strokeWidth: number
}

export type Annotation = TextAnnotation | ImageAnnotation | RectAnnotation | ShapeAnnotation | RedactionAnnotation

export type BoxAnnotation = ImageAnnotation | RectAnnotation | ShapeAnnotation | RedactionAnnotation

export type TextStyle = Pick<TextAnnotation, 'fontSize' | 'color'>

export const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 16, color: '#111111' }
export type RectStyle = Pick<RectAnnotation, 'color' | 'opacity'>

export const RECT_PRESETS: { label: string; style: RectStyle }[] = [
  { label: '白塗り', style: { color: '#ffffff', opacity: 1 } },
  { label: 'マーカー', style: { color: '#ffe14d', opacity: 0.4 } },
]

export type ShapeStyle = Pick<ShapeAnnotation, 'color' | 'strokeWidth'>

export const DEFAULT_SHAPE_STYLE: ShapeStyle = { color: '#d6403f', strokeWidth: 2 }

/** これより小さくすると、選んだりつかんだりできなくなる */
export const MIN_BOX_SIZE = 8

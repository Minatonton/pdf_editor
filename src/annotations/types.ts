/** 位置と大きさは、画面に見えている向きでのページ座標（左上が原点、単位はポイント） */
interface Placed {
  id: string
  pageIndex: number
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

export type Annotation = TextAnnotation | ImageAnnotation

export type TextStyle = Pick<TextAnnotation, 'fontSize' | 'color'>

export const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 16, color: '#111111' }
export const MIN_IMAGE_WIDTH = 8

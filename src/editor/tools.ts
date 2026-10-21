import type { LoadedImage } from '../annotations/imageFile'
import type { RectStyle, ShapeVariant } from '../annotations/types'

export type TextMark = 'highlight' | 'underline' | 'strike'

/** Acrobat の既定に近い色。ハイライトは黄色、下線は青、取り消し線は赤 */
export const MARK_COLORS: Record<Exclude<TextMark, 'highlight'>, string> = { underline: '#2f6fd0', strike: '#d6403f' }

export type Tool =
  | { kind: 'select' }
  | { kind: 'text' }
  | { kind: 'note' }
  | { kind: 'editText' }
  | { kind: 'markText'; mark: TextMark }
  | { kind: 'stamp'; text: string }
  /** width を指定しないときは、画像の画素数から大きさを決める */
  | { kind: 'image'; image: LoadedImage; width?: number }
  | { kind: 'rect'; style: RectStyle }
  | { kind: 'redaction' }
  | { kind: 'shape'; variant: ShapeVariant }

/** フォームになっていない書類に記入するときによく使う記号と、今日の日付 */
export function stampTexts(): string[] {
  const today = new Date()
  const date = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`
  return ['✓', '✗', '○', date]
}

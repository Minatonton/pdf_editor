import type { PDFPageProxy } from 'pdfjs-dist'
import type { Rotation, ViewRect } from './geometry'

interface FieldBase {
  name: string
  rect: ViewRect
  readOnly: boolean
}

export type FormField =
  | (FieldBase & { type: 'text'; value: string; multiline: boolean; maxLength?: number })
  | (FieldBase & { type: 'checkbox'; value: boolean })
  /** onValue はこのボタンを選んだときにグループが持つ値の名前 */
  | (FieldBase & { type: 'radio'; value: string; onValue: string })
  | (FieldBase & { type: 'choice'; value: string; options: { value: string; label: string }[] })

/** pdf.js が返す注釈のうち、フォームの欄（Widget）で使うところだけ */
interface WidgetData {
  annotationType: number
  fieldType?: string
  fieldName?: string
  fieldValue?: string | string[]
  rect: number[]
  readOnly?: boolean
  checkBox?: boolean
  radioButton?: boolean
  exportValue?: string
  buttonValue?: string
  multiLine?: boolean
  maxLen?: number
  options?: { exportValue: string; displayValue: string }[]
}

const WIDGET = 20

function textOf(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** ページにあるフォームの欄を、画面の向き（拡大率 1）での位置と今の値として読み取る。署名欄やボタンは扱わない */
export async function formFieldsOf(proxy: PDFPageProxy, rotation: Rotation): Promise<FormField[]> {
  const viewport = proxy.getViewport({ scale: 1, rotation })
  const annotations = (await proxy.getAnnotations()) as WidgetData[]
  return annotations.flatMap((data): FormField[] => {
    if (data.annotationType !== WIDGET || !data.fieldName) return []
    const [x1, y1] = viewport.convertToViewportPoint(data.rect[0], data.rect[1])
    const [x2, y2] = viewport.convertToViewportPoint(data.rect[2], data.rect[3])
    const base: FieldBase = {
      name: data.fieldName,
      rect: { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
      readOnly: data.readOnly ?? false,
    }
    if (data.fieldType === 'Tx') {
      return [{ ...base, type: 'text', value: textOf(data.fieldValue), multiline: data.multiLine ?? false, maxLength: data.maxLen || undefined }]
    }
    if (data.fieldType === 'Btn' && data.checkBox) {
      const value = textOf(data.fieldValue)
      return [{ ...base, type: 'checkbox', value: value !== '' && value !== 'Off' }]
    }
    if (data.fieldType === 'Btn' && data.radioButton && data.buttonValue) {
      return [{ ...base, type: 'radio', value: textOf(data.fieldValue), onValue: data.buttonValue }]
    }
    if (data.fieldType === 'Ch' && data.options) {
      const options = data.options.map((option) => ({ value: option.exportValue, label: option.displayValue }))
      return [{ ...base, type: 'choice', value: textOf(data.fieldValue), options }]
    }
    return []
  })
}


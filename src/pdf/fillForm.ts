import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, type PDFDocument, type PDFField } from 'pdf-lib'
import { rasterizeText } from '../annotations/textRaster'
import type { FieldValue } from '../editor/document'

/** pdf-lib が欄の見た目を作るのに使う Helvetica（WinAnsi）で書ける文字だけか */
function isWinAnsi(text: string): boolean {
  return /^[\n\r\t\x20-\x7e -ÿ]*$/.test(text)
}

/**
 * Helvetica で書けない文字（日本語など）の入った欄は、欄を外して、同じ場所に文字を画像で描く。
 * pdf-lib は欄の見た目を Helvetica で作ろうとして失敗し、日本語フォントを埋め込むと数MB増えるため。
 * その欄は保存後に入力し直せなくなる
 */
async function burnIn(pdf: PDFDocument, field: PDFTextField, text: string) {
  const pages = pdf.getPages()
  for (const widget of field.acroField.getWidgets()) {
    const ref = pdf.context.getObjectRef(widget.dict)
    const page = pages.find((p) => p.node.Annots()?.asArray().some((annot) => annot === ref))
    if (!page) continue
    const rect = widget.getRectangle()
    const fontSize = Math.max(6, Math.min(12, rect.height * 0.7))
    const raster = await rasterizeText({ text, fontSize, color: '#111111' })
    const image = await pdf.embedPng(raster.png)
    const scale = Math.min(1, (rect.width - 4) / raster.width)
    const height = raster.height * scale
    page.drawImage(image, { x: rect.x + 2, y: rect.y + (rect.height - height) / 2, width: raster.width * scale, height })
  }
  pdf.getForm().removeField(field)
}

function setValue(field: PDFField, value: FieldValue) {
  if (field instanceof PDFCheckBox) {
    if (value === true) field.check()
    else field.uncheck()
  } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
    if (field.getOptions().includes(value)) field.select(value)
  } else if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && typeof value === 'string') {
    if (field.getOptions().includes(value)) field.select(value)
  } else if (field instanceof PDFTextField && typeof value === 'string') {
    field.setText(value)
  }
}

/**
 * 入力した値をフォームの欄に書き込む。flatten のときは欄をページの描画に焼き込む。
 * ページを新しい PDF に写すときは文書全体のフォームが引き継がれず、欄のままでは値が表示されないため
 */
export async function fillForm(pdf: PDFDocument, values: Record<string, FieldValue>, flatten: boolean) {
  const form = pdf.getForm()
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name)
    if (!field) continue
    if (field instanceof PDFTextField && typeof value === 'string' && !isWinAnsi(value)) {
      await burnIn(pdf, field, value)
      continue
    }
    setValue(field, value)
  }
  if (flatten && form.getFields().length > 0) form.flatten()
}

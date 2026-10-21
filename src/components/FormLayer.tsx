import type { PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useState } from 'react'
import type { FieldValue } from '../editor/document'
import type { Rotation } from '../pdf/geometry'
import { formFieldsOf, type FormField } from '../pdf/formFields'

/** 欄の高さに収まる文字の大きさ。欄いっぱいの大きさだと上下が窮屈なので少し小さくする */
function fontSizeFor(field: FormField): number {
  return field.type === 'text' && field.multiline ? 12 : Math.max(6, Math.min(14, field.rect.height * 0.7))
}

/** ページのフォームの欄の上に、同じ位置・大きさの入力欄を出す */
export function FormLayer({
  proxy,
  rotation,
  scale,
  valueOf,
  onChange,
  interactive,
}: {
  proxy: PDFPageProxy
  rotation: Rotation
  scale: number
  valueOf: (name: string) => FieldValue | undefined
  onChange: (name: string, value: FieldValue) => void
  interactive: boolean
}) {
  const [fields, setFields] = useState<FormField[]>([])

  useEffect(() => {
    let cancelled = false
    void formFieldsOf(proxy, rotation).then((found) => {
      if (!cancelled) setFields(found)
    })
    return () => {
      cancelled = true
    }
  }, [proxy, rotation])

  return (
    <>
      {fields.map((field, i) => {
        const style: React.CSSProperties = {
          left: field.rect.x * scale,
          top: field.rect.y * scale,
          width: field.rect.width * scale,
          height: field.rect.height * scale,
          fontSize: fontSizeFor(field) * scale,
          pointerEvents: interactive ? 'auto' : 'none',
        }
        const current = valueOf(field.name) ?? field.value
        const common = { className: 'form-field', style, disabled: field.readOnly, title: field.name }
        switch (field.type) {
          case 'text':
            return field.multiline ? (
              <textarea key={i} {...common} value={String(current)} maxLength={field.maxLength} onChange={(e) => onChange(field.name, e.target.value)} />
            ) : (
              <input key={i} {...common} value={String(current)} maxLength={field.maxLength} onChange={(e) => onChange(field.name, e.target.value)} />
            )
          case 'checkbox':
            return (
              <input key={i} {...common} type="checkbox" checked={current === true} onChange={(e) => onChange(field.name, e.target.checked)} />
            )
          case 'radio':
            return (
              <input
                key={i}
                {...common}
                type="radio"
                checked={current === field.onValue}
                onChange={() => onChange(field.name, field.onValue)}
              />
            )
          case 'choice':
            return (
              <select key={i} {...common} value={String(current)} onChange={(e) => onChange(field.name, e.target.value)}>
                {!field.options.some((option) => option.value === current) && <option value={String(current)} />}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )
        }
      })}
    </>
  )
}

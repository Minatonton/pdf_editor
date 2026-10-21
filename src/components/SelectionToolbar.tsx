import { RECT_PRESETS, type Annotation } from '../annotations/types'
import type { EditorAction } from '../editor/document'

const FONT_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64, 72]
const COLORS = ['#111111', '#d6403f', '#2f6fd0', '#2f9e5b']

/** 選んだものの真上に出す。設定がページから離れた場所にあると見つけてもらえないため */
export function SelectionToolbar({
  annotation,
  scale,
  onRemove,
  dispatch,
}: {
  annotation: Annotation
  scale: number
  onRemove: () => void
  dispatch: (action: EditorAction) => void
}) {
  const remove = (
    <button className="icon danger" onClick={onRemove} title="削除（Delete）">
      削除
    </button>
  )

  return (
    <div
      className="selection-toolbar"
      style={{ left: annotation.x * scale, top: annotation.y * scale }}
      onPointerDown={(event) => event.stopPropagation()}
      // 入力中のテキストからフォーカスが外れて編集が終わらないよう、ボタンを押してもフォーカスを移さない
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)) event.preventDefault()
      }}
    >
      {annotation.kind === 'text' && <TextControls annotation={annotation} dispatch={dispatch} />}
      {annotation.kind === 'rect' &&
        RECT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            aria-pressed={annotation.color === preset.style.color && annotation.opacity === preset.style.opacity}
            onClick={() => dispatch({ type: 'editRect', id: annotation.id, changes: preset.style })}
          >
            {preset.label}
          </button>
        ))}
      {remove}
    </div>
  )
}

function TextControls({
  annotation,
  dispatch,
}: {
  annotation: Extract<Annotation, { kind: 'text' }>
  dispatch: (action: EditorAction) => void
}) {
  const edit = (changes: { fontSize?: number; color?: string }) => dispatch({ type: 'editText', id: annotation.id, changes })
  const sizes = [...new Set([...FONT_SIZES, annotation.fontSize])].sort((a, b) => a - b)
  return (
    <>
      <select value={annotation.fontSize} onChange={(event) => edit({ fontSize: Number(event.target.value) })} title="文字の大きさ">
        {sizes.map((size) => (
          <option key={size} value={size}>
            {size}pt
          </option>
        ))}
      </select>
      {COLORS.map((color) => (
        <button
          key={color}
          className="swatch"
          aria-pressed={annotation.color === color}
          style={{ background: color }}
          onClick={() => edit({ color })}
          title="文字の色"
        />
      ))}
      <input type="color" value={annotation.color} onChange={(event) => edit({ color: event.target.value })} title="ほかの色" />
    </>
  )
}

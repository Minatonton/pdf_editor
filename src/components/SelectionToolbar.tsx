import { whiteToTransparent } from '../annotations/imageFile'
import { safeLinkUrl } from '../annotations/linkUrl'
import { RECT_PRESETS, type Annotation, type LinkAnnotation } from '../annotations/types'
import type { EditorAction } from '../editor/document'
import { Icon } from './Icon'

const FONT_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64, 72]
const COLORS = ['#111111', '#d6403f', '#2f6fd0', '#2f9e5b']

/** 選んだものの真上に出す。設定がページから離れた場所にあると見つけてもらえないため */
export function SelectionToolbar({
  annotation,
  scale,
  pageOptions,
  onRemove,
  dispatch,
}: {
  annotation: Annotation
  scale: number
  pageOptions: { id: string; label: string }[]
  onRemove: () => void
  dispatch: (action: EditorAction) => void
}) {
  const remove = (
    <>
      <span className="toolbar-divider" />
      <button className="rail-button" data-danger onClick={onRemove} title="削除（Delete）" aria-label="削除">
        <Icon name="trash" size={18} />
      </button>
    </>
  )

  return (
    <div
      className="selection-toolbar"
      style={{ left: annotation.x * scale, top: annotation.y * scale }}
      onPointerDown={(event) => event.stopPropagation()}
      // 入力中のテキストからフォーカスが外れて編集が終わらないよう、ボタンを押してもフォーカスを移さない
      onMouseDown={(event) => {
        const target = event.target
        const field = target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        if (!field) event.preventDefault()
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
      {annotation.kind === 'image' && (
        <button
          onClick={() =>
            void whiteToTransparent(annotation.bytes, annotation.format).then((bytes) =>
              dispatch({ type: 'replaceImage', id: annotation.id, bytes, format: 'png' }),
            )
          }
          title="スキャンした印鑑やサインの、白い紙の部分を透明にする"
        >
          白を透明に
        </button>
      )}
      {annotation.kind === 'shape' && <ShapeControls annotation={annotation} dispatch={dispatch} />}
      {annotation.kind === 'link' && <LinkControls annotation={annotation} pageOptions={pageOptions} dispatch={dispatch} />}
      {annotation.kind === 'note' && (
        <textarea
          // 置いた直後にそのまま書き始められるよう、選ぶたびに入力欄へ移す
          key={annotation.id}
          autoFocus
          className="note-input"
          rows={3}
          placeholder="コメントを書く"
          value={annotation.text}
          onChange={(event) => dispatch({ type: 'editNote', id: annotation.id, text: event.target.value })}
        />
      )}
      {annotation.kind === 'redaction' && (
        <span className="toolbar-note" title="このページは保存するときに画像になり、文字の選択や検索はできなくなる">
          保存すると下の内容ごと消える
        </span>
      )}
      {annotation.kind === 'rect' && (
        <span className="toolbar-note" title="下の文字はファイルに残り、コピーや検索で読める">
          見た目だけ隠す
        </span>
      )}
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

const STROKE_WIDTHS = [1, 2, 4, 8]

function ShapeControls({
  annotation,
  dispatch,
}: {
  annotation: Extract<Annotation, { kind: 'shape' }>
  dispatch: (action: EditorAction) => void
}) {
  const edit = (changes: { color?: string; strokeWidth?: number }) => dispatch({ type: 'editShape', id: annotation.id, changes })
  return (
    <>
      <select value={annotation.strokeWidth} onChange={(event) => edit({ strokeWidth: Number(event.target.value) })} title="線の太さ">
        {STROKE_WIDTHS.map((width) => (
          <option key={width} value={width}>
            {width}pt
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
          title="線の色"
        />
      ))}
      <input type="color" value={annotation.color} onChange={(event) => edit({ color: event.target.value })} title="ほかの色" />
    </>
  )
}

function LinkControls({
  annotation,
  pageOptions,
  dispatch,
}: {
  annotation: LinkAnnotation
  pageOptions: { id: string; label: string }[]
  dispatch: (action: EditorAction) => void
}) {
  const { target } = annotation
  const url = 'url' in target ? target.url : null
  const invalid = url !== null && url.trim() !== '' && !safeLinkUrl(url)
  return (
    <>
      <select
        value={'pageId' in target ? target.pageId : 'url'}
        onChange={(event) =>
          dispatch({
            type: 'editLink',
            id: annotation.id,
            target: event.target.value === 'url' ? { url: '' } : { pageId: event.target.value },
          })
        }
        title="リンクの移り先"
      >
        <option value="url">URL を開く</option>
        {pageOptions.map((page) => (
          <option key={page.id} value={page.id}>
            {page.label}へ移る
          </option>
        ))}
      </select>
      {url !== null && (
        <input
          // 置いた直後にそのまま URL を打てるよう、選ぶたびに入力欄へ移す
          key={annotation.id}
          autoFocus
          className="link-input"
          aria-invalid={invalid}
          placeholder="https://..."
          value={url}
          onChange={(event) => dispatch({ type: 'editLink', id: annotation.id, target: { url: event.target.value } })}
          title={invalid ? 'http(s)・mailto・tel の URL だけ使える。それ以外は保存されない' : 'リンク先の URL'}
        />
      )}
    </>
  )
}

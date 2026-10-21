import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { loadImageFile, type LoadedImage } from './annotations/imageFile'
import { baselineOffset, TEXT_LINE_HEIGHT } from './annotations/textRaster'
import { normalizePoints } from './annotations/shapePath'
import {
  DEFAULT_SHAPE_STYLE,
  DEFAULT_TEXT_STYLE,
  RECT_PRESETS,
  type ShapeStyle,
  type TextStyle,
} from './annotations/types'
import { PagePanel } from './components/PagePanel'
import { PageView } from './components/PageView'
import { PageMarksDialog } from './components/PageMarksDialog'
import { SignatureDialog, type SignatureKind } from './components/SignatureDialog'
import { ToolBar } from './components/ToolBar'
import { MARK_COLORS, type Tool } from './editor/tools'
import { EMPTY_HISTORY, editorReducer, fieldKey, viewSizeOf, type EditorAction, type PageRef } from './editor/document'
import { exportPdf } from './pdf/exportPdf'
import { boundsOf, type Point } from './pdf/geometry'
import { openPdf, pageRefsOf, type OpenedPdf } from './pdf/loadPdf'
import { rasterizerFor } from './pdf/rasterize'
import type { TextRun } from './pdf/textRuns'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
/** 画像の画素を、画面と同じ 96dpi とみなしてポイントに直す */
const POINTS_PER_PIXEL = 72 / 96
const SIGNATURE_WIDTH = 150
const SEAL_WIDTH = 42

function isEditingField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function downloadPdf(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  /** 開いた PDF。保存する文書は2つ目以降のファイルのページも含められるので、ファイル番号で引く */
  const [files, setFiles] = useState<OpenedPdf[]>([])
  const [history, dispatchHistory] = useReducer(editorReducer, EMPTY_HISTORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([])
  /** PDF を選ぶ欄を、新しく開くために使うか、今の文書に差し込むために使うか */
  const pdfInputPurpose = useRef<{ insertAt: number } | 'open'>('open')
  const [tool, setTool] = useState<Tool>({ kind: 'select' })
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE)
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE_STYLE)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState(false)
  const [editingMarks, setEditingMarks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const { pages, annotations } = history.present
  const pdf = files.at(0)
  const hasEdits = history.past.length > 0

  // 次に置くテキストは、最後に変えたサイズと色を引き継ぐ
  const dispatch = (action: EditorAction) => {
    if (action.type === 'editText') {
      const { fontSize, color } = action.changes
      setTextStyle((style) => ({ fontSize: fontSize ?? style.fontSize, color: color ?? style.color }))
    }
    if (action.type === 'editShape') setShapeStyle((style) => ({ ...style, ...action.changes }))
    dispatchHistory(action)
  }

  useEffect(() => {
    if (!hasEdits) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasEdits])

  // 空のまま入力を終えたテキストは、置くのをやめたとみなして消す
  const endEditing = () => {
    const edited = annotations.find((annotation) => annotation.id === editingId)
    if (edited?.kind === 'text' && edited.text.trim() === '') {
      dispatch({ type: 'remove', id: edited.id })
      setSelectedId(null)
    }
    setEditingId(null)
  }

  const removeAnnotation = (id: string) => {
    dispatch({ type: 'remove', id })
    setSelectedId(null)
    setEditingId(null)
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingId) {
          endEditing()
          return
        }
        setTool({ kind: 'select' })
        setSelectedId(null)
        return
      }
      if (isEditingField(event.target)) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (!selectedId) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeAnnotation(selectedId)
        return
      }
      if (event.key === 'Enter' && annotations.find((annotation) => annotation.id === selectedId)?.kind === 'text') {
        event.preventDefault()
        setEditingId(selectedId)
        return
      }
      const step = event.shiftKey ? 10 : 1
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const nudge = nudges[event.key]
      if (nudge) {
        event.preventDefault()
        dispatch({ type: 'move', id: selectedId, dx: nudge[0], dy: nudge[1] })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleOpenPdf = (file: File) => {
    if (hasEdits && !window.confirm('書き込んだ内容は保存されていません。別の PDF を開きますか？')) return
    void run(async () => {
      const opened = await openPdf(file)
      for (const old of files) void old.document.loadingTask.destroy()
      setFiles([opened])
      dispatch({ type: 'open', pages: pageRefsOf(opened, 0) })
      setSelectedId(null)
      setSelectedPageIds([])
      setTool({ kind: 'select' })
    })
  }

  const handleInsertPdf = (file: File, index: number) => {
    void run(async () => {
      const opened = await openPdf(file)
      const refs = pageRefsOf(opened, files.length)
      setFiles([...files, opened])
      dispatch({ type: 'insertPages', pages: refs, index })
      setSelectedPageIds(refs.map((ref) => ref.id))
    })
  }

  const chooseInsertPdf = (index: number) => {
    pdfInputPurpose.current = { insertAt: index }
    pdfInput.current?.click()
  }

  const chooseOpenPdf = () => {
    pdfInputPurpose.current = 'open'
    pdfInput.current?.click()
  }

  const proxyOf = (ref: PageRef) => files[ref.file]?.pages[ref.index]

  const jumpToPage = (id: string) => document.getElementById(`page-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const handleChooseImage = (file: File) => {
    void run(async () => setTool({ kind: 'image', image: await loadImageFile(file) }))
  }

  const handlePlace = (pageId: string, x: number, y: number) => {
    const id = crypto.randomUUID()
    // クリックした点が1行目の高さの真ん中に来るようにする。文字の書き出し位置を指す感覚に合わせるため
    const lineMiddle = y - (textStyle.fontSize * TEXT_LINE_HEIGHT) / 2
    if (tool.kind === 'text') {
      dispatch({ type: 'add', annotation: { id, kind: 'text', pageId, x, y: lineMiddle, text: '', ...textStyle } })
      setEditingId(id)
    } else if (tool.kind === 'stamp') {
      // ✓ などの記号は、チェック欄の真ん中をクリックして置くので、1文字目の中心をクリックした点に合わせる
      const x0 = x - textStyle.fontSize / 2
      dispatch({ type: 'add', annotation: { id, kind: 'text', pageId, x: x0, y: lineMiddle, text: tool.text, ...textStyle } })
    } else if (tool.kind === 'image') {
      const page = pages.find((ref) => ref.id === pageId)!
      const pageWidth = viewSizeOf(page).width
      const { image } = tool
      const width = tool.width ?? Math.min(image.pixelWidth * POINTS_PER_PIXEL, pageWidth / 2)
      const height = (image.pixelHeight * width) / image.pixelWidth
      dispatch({
        type: 'add',
        annotation: {
          id,
          kind: 'image',
          pageId,
          x: x - width / 2,
          y: y - height / 2,
          width,
          height,
          bytes: image.bytes,
          format: image.format,
        },
      })
    }
    setSelectedId(id)
    setTool({ kind: 'select' })
  }

  const handleDraw = (pageId: string, points: Point[]) => {
    const id = crypto.randomUUID()
    const rect = boundsOf(points)
    // クリックしただけのときは、何も描かれないと置けたのか分からないので、決まった大きさで置く
    const clicked = rect.width < 4 && rect.height < 4
    const lineBox = clicked ? { x: rect.x, y: rect.y - 12, width: 120, height: 24 } : rect
    if (tool.kind === 'rect') {
      dispatch({ type: 'add', annotation: { id, kind: 'rect', pageId, ...lineBox, ...tool.style } })
    } else if (tool.kind === 'redaction') {
      dispatch({ type: 'add', annotation: { id, kind: 'redaction', pageId, ...lineBox } })
    } else if (tool.kind === 'shape') {
      if (clicked && tool.variant === 'ink') return
      const straight = tool.variant === 'line' || tool.variant === 'arrow'
      const drawn = clicked ? [points[0], { x: points[0].x + 80, y: points[0].y + (straight ? 0 : 50) }] : points
      dispatch({
        type: 'add',
        annotation: { id, kind: 'shape', pageId, variant: tool.variant, ...normalizePoints(drawn), ...shapeStyle },
      })
    } else {
      return
    }
    setSelectedId(id)
    // 手書きは何画も続けて書くことが多いので、ペンを持ったままにする
    if (tool.kind !== 'shape' || tool.variant !== 'ink') setTool({ kind: 'select' })
  }

  /**
   * 元の文字は書き換えられないので、その行を白塗りで隠し、同じ位置・大きさの文字を置いてすぐ打ち直せるようにする。
   * フォントは元と同じにはならない
   */
  const handlePickText = (pageId: string, line: TextRun) => {
    const fontSize = Math.round(line.fontSize * 2) / 2
    const textId = crypto.randomUUID()
    dispatch({
      type: 'addMany',
      annotations: [
        {
          id: crypto.randomUUID(),
          kind: 'rect',
          pageId,
          // 文字の端が残らないよう、行の周りを少し広めに隠す
          x: line.x - 1,
          y: line.y - 1,
          width: line.width + 2,
          height: line.height + 2,
          ...RECT_PRESETS[0].style,
        },
        {
          id: textId,
          kind: 'text',
          pageId,
          x: line.x,
          y: line.baseline - baselineOffset(fontSize),
          text: line.text,
          fontSize,
          color: '#111111',
        },
      ],
    })
    setSelectedId(textId)
    setEditingId(textId)
    setTool({ kind: 'select' })
  }

  const handleMarkText = (pageId: string, lines: TextRun[]) => {
    if (tool.kind !== 'markText' || lines.length === 0) return
    const { mark } = tool
    dispatch({
      type: 'addMany',
      annotations: lines.map((line) => {
        const id = crypto.randomUUID()
        if (mark === 'highlight') {
          return { id, kind: 'rect' as const, pageId, x: line.x, y: line.y, width: line.width, height: line.height, ...RECT_PRESETS[1].style }
        }
        // 下線は字面のすぐ下、取り消し線は小文字や仮名の真ん中あたりを通す
        const y = mark === 'underline' ? line.baseline + line.fontSize * 0.12 : line.baseline - line.fontSize * 0.3
        return {
          id,
          kind: 'shape' as const,
          pageId,
          variant: 'line' as const,
          x: line.x,
          y,
          width: line.width,
          height: 0,
          points: [
            [0, 0],
            [1, 0],
          ] as [number, number][],
          color: MARK_COLORS[mark],
          strokeWidth: Math.max(0.5, Math.round(line.fontSize * 0.07 * 2) / 2),
        }
      }),
    })
  }

  const handleExport = () => {
    if (!pdf) return
    void run(async () => {
      const bytes = await exportPdf(
        files.map((file) => file.bytes),
        history.present,
        rasterizerFor(proxyOf),
      )
      downloadPdf(bytes, `${pdf.name.replace(/\.pdf$/i, '')}_edited.pdf`)
    })
  }

  const handleExtract = () => {
    if (!pdf) return
    const ids = new Set(selectedPageIds)
    void run(async () => {
      const bytes = await exportPdf(
        files.map((file) => file.bytes),
        { ...history.present, pages: pages.filter((page) => ids.has(page.id)) },
        rasterizerFor(proxyOf),
      )
      downloadPdf(bytes, `${pdf.name.replace(/\.pdf$/i, '')}_${ids.size}pages.pdf`)
    })
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    // 開いている文書があれば、落とした PDF は末尾に足す。開き直したいときは「PDF を開く」を使う
    if (file.type === 'application/pdf') {
      if (pdf) handleInsertPdf(file, pages.length)
      else handleOpenPdf(file)
    }
    else if (file.type.startsWith('image/') && pdf) handleChooseImage(file)
  }

  const placingHint =
    tool.kind === 'editText'
      ? '書き換えたい文字の行をクリック'
      : tool.kind === 'markText'
        ? '印を付けたい文字の上をドラッグ（続けて何か所でも付けられる）'
      : tool.kind === 'text'
        ? 'テキストを置く場所をクリック'
      : tool.kind === 'stamp'
        ? `「${tool.text}」を置く場所をクリック`
      : tool.kind === 'image'
        ? '画像を置く場所をクリック'
        : tool.kind === 'rect'
          ? '隠したい範囲をドラッグ'
          : tool.kind === 'redaction'
            ? '消したい範囲をドラッグ'
          : tool.kind === 'shape'
            ? tool.variant === 'ink'
              ? 'ドラッグして書く'
              : 'ドラッグして描く'
            : null

  return (
    <div className="app" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="toolbar">
        <h1>PDF Editor</h1>
        <button onClick={chooseOpenPdf}>PDF を開く</button>
        {pdf && <span className="file-name">{pdf.name}</span>}
        <span className="spacer" />
        <button disabled={history.past.length === 0} onClick={() => dispatch({ type: 'undo' })} title="元に戻す（⌘Z）">
          元に戻す
        </button>
        <button disabled={history.future.length === 0} onClick={() => dispatch({ type: 'redo' })} title="やり直す（⌘⇧Z）">
          やり直す
        </button>
        <span className="divider" />
        <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={!pdf} aria-label="表示倍率">
          {ZOOMS.map((value) => (
            <option key={value} value={value}>
              {Math.round(value * 100)}%
            </option>
          ))}
        </select>
        <button className="primary" disabled={!pdf || busy} onClick={handleExport}>
          PDF を保存
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            const purpose = pdfInputPurpose.current
            if (file) {
              if (purpose === 'open') handleOpenPdf(file)
              else handleInsertPdf(file, purpose.insertAt)
            }
            event.target.value = ''
          }}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) handleChooseImage(file)
            event.target.value = ''
          }}
        />
      </header>

      {pdf && (
        <ToolBar
          tool={tool}
          onToolChange={setTool}
          onChooseImage={() => imageInput.current?.click()}
          onSign={() => setSigning(true)}
          onEditPageMarks={() => setEditingMarks(true)}
        />
      )}

      {editingMarks && (
        <PageMarksDialog marks={history.present.pageMarks} dispatch={dispatch} onClose={() => setEditingMarks(false)} />
      )}

      {signing && (
        <SignatureDialog
          onClose={() => setSigning(false)}
          onCreate={(image: LoadedImage, kind: SignatureKind) => {
            setSigning(false)
            // 署名欄や押印欄にそのまま収まる大きさで置く。印鑑は一般的な認印の直径（約15mm）
            setTool({ kind: 'image', image, width: kind === 'seal' ? SEAL_WIDTH : SIGNATURE_WIDTH })
          }}
        />
      )}

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError(null)}>閉じる</button>
        </div>
      )}

      <div className="workspace">
        {pdf && (
          <PagePanel
            pages={pages}
            proxyOf={proxyOf}
            selectedIds={selectedPageIds}
            onSelect={setSelectedPageIds}
            onJump={jumpToPage}
            onAddFile={chooseInsertPdf}
            onExtract={handleExtract}
            dispatch={dispatch}
          />
        )}
        {placingHint && <div className="placing-hint">{placingHint}（Esc でやめる）</div>}
        <main className="pages">
          {pdf ? (
            pages.map((ref, pageIndex) => (
              <PageView
                key={ref.id}
                page={ref}
                proxy={proxyOf(ref)}
                pageNumber={pageIndex + 1}
                pageCount={pages.length}
                pageMarks={history.present.pageMarks}
                scale={zoom}
                annotations={annotations.filter((annotation) => annotation.pageId === ref.id)}
                selectedId={selectedId}
                editingId={editingId}
                placing={tool.kind !== 'select'}
                drawMode={tool.kind === 'rect' || tool.kind === 'redaction' || tool.kind === 'markText' || (tool.kind === 'shape' && tool.variant !== 'ink') ? 'box' : tool.kind === 'shape' ? 'ink' : null}
                onPlace={handlePlace}
                onDraw={handleDraw}
                textMode={tool.kind === 'editText' ? 'pick' : tool.kind === 'markText' ? 'mark' : null}
                onPickText={handlePickText}
                onMarkText={handleMarkText}
                fieldValueOf={(name) => history.present.formValues[fieldKey(ref.file, name)]}
                onFieldChange={(name, value) => dispatch({ type: 'setField', key: fieldKey(ref.file, name), value })}
                onSelect={(id) => {
                  if (id !== editingId) setEditingId(null)
                  setSelectedId(id)
                }}
                onEdit={setEditingId}
                onEditEnd={endEditing}
                onRemove={removeAnnotation}
                dispatch={dispatch}
              />
            ))
          ) : (
            <div className="empty">
              <p>PDF をここにドロップするか、選んで開く</p>
              <button className="primary" onClick={chooseOpenPdf} disabled={busy}>
                PDF を開く
              </button>
              <p className="note">ファイルはブラウザの中だけで処理され、どこにも送信されない</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

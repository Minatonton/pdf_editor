import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { EMPTY_HISTORY, historyReducer, type HistoryAction } from './annotations/history'
import { loadImageFile, type LoadedImage } from './annotations/imageFile'
import { DEFAULT_TEXT_STYLE, type TextStyle } from './annotations/types'
import { Inspector } from './components/Inspector'
import { PageView } from './components/PageView'
import { exportPdf } from './pdf/exportPdf'
import { openPdf, type OpenedPdf } from './pdf/loadPdf'

type Tool = { kind: 'select' } | { kind: 'text' } | { kind: 'image'; image: LoadedImage }

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
/** 画像の画素を、画面と同じ 96dpi とみなしてポイントに直す */
const POINTS_PER_PIXEL = 72 / 96

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
  const [pdf, setPdf] = useState<OpenedPdf | null>(null)
  const [history, dispatchHistory] = useReducer(historyReducer, EMPTY_HISTORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>({ kind: 'select' })
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const annotations = history.present
  const selected = annotations.find((annotation) => annotation.id === selectedId)
  const hasEdits = annotations.length > 0

  // 次に置くテキストは、最後に変えたサイズと色を引き継ぐ
  const dispatch = (action: HistoryAction) => {
    if (action.type === 'editText') {
      const { fontSize, color } = action.changes
      setTextStyle((style) => ({ fontSize: fontSize ?? style.fontSize, color: color ?? style.color }))
    }
    dispatchHistory(action)
  }

  useEffect(() => {
    if (!hasEdits) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasEdits])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
        dispatch({ type: 'remove', id: selectedId })
        setSelectedId(null)
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
  }, [selectedId])

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
      void pdf?.document.loadingTask.destroy()
      setPdf(opened)
      dispatch({ type: 'reset' })
      setSelectedId(null)
      setTool({ kind: 'select' })
    })
  }

  const handleChooseImage = (file: File) => {
    void run(async () => setTool({ kind: 'image', image: await loadImageFile(file) }))
  }

  const handlePlace = (pageIndex: number, x: number, y: number) => {
    const id = crypto.randomUUID()
    if (tool.kind === 'text') {
      dispatch({ type: 'add', annotation: { id, kind: 'text', pageIndex, x, y, text: 'テキスト', ...textStyle } })
    } else if (tool.kind === 'image' && pdf) {
      const pageWidth = pdf.pages[pageIndex].getViewport({ scale: 1 }).width
      const { image } = tool
      const width = Math.min(image.pixelWidth * POINTS_PER_PIXEL, pageWidth / 2)
      const height = (image.pixelHeight * width) / image.pixelWidth
      dispatch({
        type: 'add',
        annotation: {
          id,
          kind: 'image',
          pageIndex,
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

  const handleExport = () => {
    if (!pdf) return
    void run(async () => {
      const bytes = await exportPdf(pdf.bytes, annotations)
      downloadPdf(bytes, `${pdf.name.replace(/\.pdf$/i, '')}_edited.pdf`)
    })
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (file.type === 'application/pdf') handleOpenPdf(file)
    else if (file.type.startsWith('image/') && pdf) handleChooseImage(file)
  }

  const placingHint =
    tool.kind === 'text' ? 'テキストを置く場所をクリック' : tool.kind === 'image' ? '画像を置く場所をクリック' : null

  return (
    <div className="app" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="toolbar">
        <h1>PDF Editor</h1>
        <button onClick={() => pdfInput.current?.click()}>PDF を開く</button>
        <span className="divider" />
        <button
          disabled={!pdf}
          aria-pressed={tool.kind === 'text'}
          onClick={() => setTool(tool.kind === 'text' ? { kind: 'select' } : { kind: 'text' })}
        >
          テキスト
        </button>
        <button disabled={!pdf} aria-pressed={tool.kind === 'image'} onClick={() => imageInput.current?.click()}>
          画像
        </button>
        <span className="divider" />
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
        <span className="spacer" />
        {pdf && <span className="file-name">{pdf.name}</span>}
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
            if (file) handleOpenPdf(file)
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

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError(null)}>閉じる</button>
        </div>
      )}

      <div className="workspace">
        <main className="pages">
          {placingHint && <div className="placing-hint">{placingHint}（Esc でやめる）</div>}
          {pdf ? (
            pdf.pages.map((page, pageIndex) => (
              <PageView
                key={pageIndex}
                page={page}
                pageIndex={pageIndex}
                scale={zoom}
                annotations={annotations.filter((annotation) => annotation.pageIndex === pageIndex)}
                selectedId={selectedId}
                placing={tool.kind !== 'select'}
                onPlace={handlePlace}
                onSelect={setSelectedId}
                dispatch={dispatch}
              />
            ))
          ) : (
            <div className="empty">
              <p>PDF をここにドロップするか、選んで開く</p>
              <button className="primary" onClick={() => pdfInput.current?.click()} disabled={busy}>
                PDF を開く
              </button>
              <p className="note">ファイルはブラウザの中だけで処理され、どこにも送信されない</p>
            </div>
          )}
        </main>
        {pdf && <Inspector annotation={selected} dispatch={dispatch} />}
      </div>
    </div>
  )
}

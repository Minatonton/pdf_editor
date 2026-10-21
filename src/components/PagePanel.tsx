import type { PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BLANK_PAGE_FILE, viewSizeOf, visibleRectOf, type EditorAction, type PageRef } from '../editor/document'

const THUMBNAIL_WIDTH = 112

function Thumbnail({ page, proxy }: { page: PageRef; proxy: PDFPageProxy }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = viewSizeOf(page)
  const visible = visibleRectOf(page)
  const scale = THUMBNAIL_WIDTH / visible.width

  useEffect(() => {
    const canvas = canvasRef.current!
    const viewport = proxy.getViewport({ scale: scale * (window.devicePixelRatio || 1), rotation: page.rotation })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const task = proxy.render({ canvas, viewport })
    task.promise.catch((error: unknown) => {
      if ((error as Error).name !== 'RenderingCancelledException') console.error(error)
    })
    return () => task.cancel()
  }, [proxy, page.rotation, scale])

  return (
    <div className="thumbnail-clip" style={{ width: THUMBNAIL_WIDTH, height: visible.height * scale }}>
      <canvas
        ref={canvasRef}
        style={{ left: -visible.x * scale, top: -visible.y * scale, width: size.width * scale, height: size.height * scale }}
      />
    </div>
  )
}

export function PagePanel({
  pages,
  proxyOf,
  selectedIds,
  onSelect,
  onJump,
  onAddFile,
  onExtract,
  onCrop,
  dispatch,
}: {
  pages: PageRef[]
  proxyOf: (page: PageRef) => PDFPageProxy | undefined
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onJump: (id: string) => void
  onAddFile: (index: number) => void
  onExtract: () => void
  onCrop: (ids: string[]) => void
  dispatch: (action: EditorAction) => void
}) {
  // 範囲選択の起点。Shift を押しながら選んだときに、ここから選んだページまでをまとめて選ぶ
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const selected = new Set(selectedIds)
  const targets = selectedIds.length > 0 ? selectedIds : []
  const insertIndex = selectedIds.length > 0 ? Math.max(...selectedIds.map((id) => pages.findIndex((p) => p.id === id))) + 1 : pages.length

  const handleClick = (event: MouseEvent, page: PageRef) => {
    if (event.shiftKey && anchorId) {
      const from = pages.findIndex((p) => p.id === anchorId)
      const to = pages.findIndex((p) => p.id === page.id)
      const [start, end] = from < to ? [from, to] : [to, from]
      onSelect(pages.slice(start, end + 1).map((p) => p.id))
      return
    }
    if (event.metaKey || event.ctrlKey) {
      onSelect(selected.has(page.id) ? selectedIds.filter((id) => id !== page.id) : [...selectedIds, page.id])
    } else {
      onSelect([page.id])
      onJump(page.id)
    }
    setAnchorId(page.id)
  }

  const insertBlank = () => {
    // 空白のページは、差し込む位置の直前のページと同じ大きさにする。書類の途中に別の大きさが混ざらないように
    const model = pages[Math.max(0, insertIndex - 1)]
    const blank: PageRef = { ...model, id: crypto.randomUUID(), file: BLANK_PAGE_FILE, index: 0, rotation: model.rotation }
    dispatch({ type: 'insertPages', pages: [blank], index: insertIndex })
    onSelect([blank.id])
  }

  return (
    <nav className="page-panel" aria-label="ページ">
      <div className="page-actions">
        <button disabled={targets.length === 0} onClick={() => dispatch({ type: 'rotatePages', ids: targets, degrees: -90 })} title="左に回す">
          ↺
        </button>
        <button disabled={targets.length === 0} onClick={() => dispatch({ type: 'rotatePages', ids: targets, degrees: 90 })} title="右に回す">
          ↻
        </button>
        <button
          className="danger"
          disabled={targets.length === 0 || targets.length === pages.length}
          onClick={() => {
            dispatch({ type: 'removePages', ids: targets })
            onSelect([])
          }}
          title="選んだページを削除"
        >
          削除
        </button>
        <button onClick={insertBlank} title="選んだページの後ろに白紙のページを入れる">
          白紙
        </button>
        <button onClick={() => onAddFile(insertIndex)} title="別の PDF のページを、選んだページの後ろに入れる">
          追加
        </button>
        <button disabled={targets.length === 0} onClick={onExtract} title="選んだページだけを別の PDF として保存">
          抽出
        </button>
        <button disabled={targets.length === 0} onClick={() => onCrop(targets)} title="選んだページの残す範囲を描いて、余白などを切り落とす">
          切抜
        </button>
        <button
          disabled={!pages.some((page) => selected.has(page.id) && page.crop)}
          onClick={() => dispatch({ type: 'cropPages', ids: targets, rect: null })}
          title="選んだページのトリミングを外して、ページ全体に戻す"
        >
          全体
        </button>
      </div>
      <p className="note">{selectedIds.length > 0 ? `${selectedIds.length} ページを選択中` : '⌘ / Shift で複数選べる'}</p>
      <ol
        className="thumbnails"
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropIndex(null)
        }}
      >
        {pages.map((page, i) => (
          <li
            key={page.id}
            draggable
            data-selected={selected.has(page.id)}
            data-drop-before={dropIndex === i}
            data-drop-after={dropIndex === pages.length && i === pages.length - 1}
            onClick={(event) => handleClick(event, page)}
            onDragStart={(event) => {
              if (!selected.has(page.id)) onSelect([page.id])
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-pdf-editor-page', page.id)
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('application/x-pdf-editor-page')) return
              event.preventDefault()
              const bounds = event.currentTarget.getBoundingClientRect()
              setDropIndex(event.clientY < bounds.top + bounds.height / 2 ? i : i + 1)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (dropIndex === null) return
              const dragged = event.dataTransfer.getData('application/x-pdf-editor-page')
              const moving = selected.has(dragged) ? selectedIds : [dragged]
              // 移す位置は「動かすページを除いた並び」で数えるので、それより前にある動かすページの数だけ詰める
              const before = pages.slice(0, dropIndex).filter((p) => moving.includes(p.id)).length
              dispatch({ type: 'movePages', ids: moving, index: dropIndex - before })
              setDropIndex(null)
            }}
          >
            {page.file === BLANK_PAGE_FILE ? (
              <div className="blank-thumbnail" style={{ aspectRatio: `${viewSizeOf(page).width} / ${viewSizeOf(page).height}` }} />
            ) : (
              <Thumbnail page={page} proxy={proxyOf(page)!} />
            )}
            <span>{i + 1}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

import type { PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { viewSizeOf, type EditorAction, type PageRef } from '../editor/document'
import type { Annotation } from '../annotations/types'
import type { ViewRect } from '../pdf/geometry'
import { AnnotationBox } from './AnnotationBox'
import { SelectionToolbar } from './SelectionToolbar'

export function PageView({
  page,
  proxy,
  pageNumber,
  scale,
  annotations,
  selectedId,
  editingId,
  placing,
  drawsBox,
  onPlace,
  onDrawBox,
  onSelect,
  onEdit,
  onEditEnd,
  onRemove,
  dispatch,
}: {
  page: PageRef
  /** 白紙のページには元になる PDF のページがない */
  proxy: PDFPageProxy | undefined
  pageNumber: number
  scale: number
  annotations: Annotation[]
  selectedId: string | null
  editingId: string | null
  placing: boolean
  /** クリックではなく、ドラッグで範囲を描いて置く */
  drawsBox: boolean
  onPlace: (pageId: string, x: number, y: number) => void
  onDrawBox: (pageId: string, rect: ViewRect) => void
  onSelect: (id: string | null) => void
  onEdit: (id: string) => void
  onEditEnd: () => void
  onRemove: (id: string) => void
  dispatch: (action: EditorAction) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = viewSizeOf(page)
  const selected = annotations.find((annotation) => annotation.id === selectedId)
  const [drawing, setDrawing] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  // 描き終えた直後に続けて届く click を、何もない所のクリック（選択の解除）として扱わないための印
  const justDrew = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!proxy || !canvas) return
    const viewport = proxy.getViewport({ scale, rotation: page.rotation })
    // 高解像度の画面でぼやけないよう、表示する大きさより画素数を多くして描く
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    const task = proxy.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
    task.promise.catch((error: unknown) => {
      if ((error as Error).name !== 'RenderingCancelledException') console.error(error)
    })
    return () => task.cancel()
  }, [proxy, page.rotation, scale])

  // pointerdown で置くと、その後の mousedown がフォーカスを奪い、置いた直後のテキストの入力欄から外れてしまう
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (justDrew.current) {
      justDrew.current = false
      return
    }
    if (event.target !== event.currentTarget || event.button !== 0 || drawsBox) return
    if (!placing) {
      onSelect(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    onPlace(page.id, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
  }

  const pointInPage = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }
  }

  const rectOf = (d: NonNullable<typeof drawing>): ViewRect => ({
    x: Math.min(d.startX, d.x),
    y: Math.min(d.startY, d.y),
    width: Math.abs(d.x - d.startX),
    height: Math.abs(d.y - d.startY),
  })
  const drawnRect = drawing && rectOf(drawing)

  const drawHandlers = drawsBox
    ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = pointInPage(event)
          setDrawing({ startX: point.x, startY: point.y, ...point })
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          const point = pointInPage(event)
          setDrawing((current) => current && { ...current, ...point })
        },
        // 指を離した位置は、最後の描画を待たずにこのイベントから取る。素早く引くと描画が追いつかないため
        onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
          if (!drawing) return
          onDrawBox(page.id, rectOf({ ...drawing, ...pointInPage(event) }))
          justDrew.current = true
          setDrawing(null)
        },
      }
    : {}

  return (
    <div className="page" id={`page-${page.id}`} style={{ width: size.width * scale, height: size.height * scale }}>
      {proxy && <canvas ref={canvasRef} style={{ width: size.width * scale, height: size.height * scale }} />}
      <div className="page-overlay" data-placing={placing} onClick={handleClick} {...drawHandlers}>
        {drawnRect && (
          <div
            className="drawing-rect"
            style={{
              left: drawnRect.x * scale,
              top: drawnRect.y * scale,
              width: drawnRect.width * scale,
              height: drawnRect.height * scale,
            }}
          />
        )}
        {annotations.map((annotation) => (
          <AnnotationBox
            key={annotation.id}
            annotation={annotation}
            scale={scale}
            selected={annotation.id === selectedId}
            editing={annotation.id === editingId}
            interactive={!placing}
            onSelect={onSelect}
            onEdit={onEdit}
            onEditEnd={onEditEnd}
            dispatch={dispatch}
          />
        ))}
        {selected && !placing && (
          <SelectionToolbar annotation={selected} scale={scale} onRemove={() => onRemove(selected.id)} dispatch={dispatch} />
        )}
      </div>
      <span className="page-number">
        {pageNumber}
      </span>
    </div>
  )
}

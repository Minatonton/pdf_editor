import type { PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useRef, type MouseEvent } from 'react'
import { viewSizeOf, type EditorAction, type PageRef } from '../editor/document'
import type { Annotation } from '../annotations/types'
import { AnnotationBox } from './AnnotationBox'

export function PageView({
  page,
  proxy,
  pageNumber,
  scale,
  annotations,
  selectedId,
  placing,
  onPlace,
  onSelect,
  dispatch,
}: {
  page: PageRef
  proxy: PDFPageProxy
  pageNumber: number
  scale: number
  annotations: Annotation[]
  selectedId: string | null
  placing: boolean
  onPlace: (pageId: string, x: number, y: number) => void
  onSelect: (id: string | null) => void
  dispatch: (action: EditorAction) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = viewSizeOf(page)

  useEffect(() => {
    const canvas = canvasRef.current!
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
    if (event.target !== event.currentTarget || event.button !== 0) return
    if (!placing) {
      onSelect(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    onPlace(page.id, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
  }

  return (
    <div className="page" style={{ width: size.width * scale, height: size.height * scale }}>
      <canvas ref={canvasRef} style={{ width: size.width * scale, height: size.height * scale }} />
      <div className="page-overlay" data-placing={placing} onClick={handleClick}>
        {annotations.map((annotation) => (
          <AnnotationBox
            key={annotation.id}
            annotation={annotation}
            scale={scale}
            selected={annotation.id === selectedId}
            interactive={!placing}
            onSelect={onSelect}
            dispatch={dispatch}
          />
        ))}
      </div>
      <span className="page-number">
        {pageNumber}
      </span>
    </div>
  )
}

import { useState, type PointerEvent } from 'react'
import type { HistoryAction } from '../annotations/history'
import { mimeTypeOf } from '../annotations/imageFile'
import { TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../annotations/textRaster'
import { MIN_IMAGE_WIDTH, type Annotation, type ImageAnnotation } from '../annotations/types'

interface Drag {
  mode: 'move' | 'resize'
  startX: number
  startY: number
  dx: number
  dy: number
}

/**
 * 画像の URL は解放せずに使い回す。元に戻す・やり直すで同じ画像が何度も現れるので、
 * 表示から消えたときに解放すると、戻したときに表示できなくなる
 */
const objectUrls = new WeakMap<Uint8Array, string>()

function objectUrlOf(image: ImageAnnotation): string {
  let url = objectUrls.get(image.bytes)
  if (!url) {
    url = URL.createObjectURL(new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: mimeTypeOf(image.format) }))
    objectUrls.set(image.bytes, url)
  }
  return url
}

export function AnnotationBox({
  annotation,
  scale,
  selected,
  interactive,
  onSelect,
  dispatch,
}: {
  annotation: Annotation
  scale: number
  selected: boolean
  interactive: boolean
  onSelect: (id: string) => void
  dispatch: (action: HistoryAction) => void
}) {
  // ドラッグ中は位置を手元だけで動かし、離したときに1回だけ履歴に積む。
  // 動かすたびに積むと、元に戻すがドラッグの途中の位置を1つずつたどることになる
  const [drag, setDrag] = useState<Drag | null>(null)

  const begin = (mode: Drag['mode']) => (event: PointerEvent<HTMLElement>) => {
    if (!interactive || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    onSelect(annotation.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 })
  }

  const handleMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return
    setDrag({ ...drag, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY })
  }

  const handleEnd = () => {
    if (!drag) return
    const dx = drag.dx / scale
    const dy = drag.dy / scale
    if (drag.mode === 'move' && (dx !== 0 || dy !== 0)) dispatch({ type: 'move', id: annotation.id, dx, dy })
    if (drag.mode === 'resize' && annotation.kind === 'image' && dx !== 0) {
      dispatch({ type: 'resizeImage', id: annotation.id, width: annotation.width + dx })
    }
    setDrag(null)
  }

  const moveX = drag?.mode === 'move' ? drag.dx / scale : 0
  const moveY = drag?.mode === 'move' ? drag.dy / scale : 0
  const style: React.CSSProperties = {
    left: (annotation.x + moveX) * scale,
    top: (annotation.y + moveY) * scale,
    pointerEvents: interactive ? 'auto' : 'none',
  }

  if (annotation.kind === 'image') {
    const width = Math.max(MIN_IMAGE_WIDTH, annotation.width + (drag?.mode === 'resize' ? drag.dx / scale : 0))
    const height = (annotation.height * width) / annotation.width
    return (
      <div
        className="annotation image"
        data-selected={selected}
        style={{ ...style, width: width * scale, height: height * scale }}
        onPointerDown={begin('move')}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        <img src={objectUrlOf(annotation)} alt="" draggable={false} />
        {selected && <span className="resize-handle" onPointerDown={begin('resize')} aria-label="大きさを変える" />}
      </div>
    )
  }

  return (
    <div
      className="annotation text"
      data-selected={selected}
      style={{
        ...style,
        fontFamily: TEXT_FONT_FAMILY,
        fontSize: annotation.fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: annotation.color,
      }}
      onPointerDown={begin('move')}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
    >
      {annotation.text || ' '}
    </div>
  )
}

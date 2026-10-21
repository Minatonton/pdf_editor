import { useState } from 'react'
import { stepZoom } from '../editor/zoom'
import { Icon } from './Icon'

/**
 * 書類の下に浮かせるページ移動と倍率の操作。書類から目を離さずに操作できるよう、上の帯ではなく書類の上に置く
 */
export function PageNavigator({
  current,
  total,
  onGo,
  zoom,
  onZoom,
  onFitWidth,
}: {
  current: number
  total: number
  onGo: (index: number) => void
  zoom: number
  onZoom: (zoom: number) => void
  onFitWidth: () => void
}) {
  // 打っている途中の番号。確定するまでは、スクロールで今のページが変わっても上書きしない
  const [typing, setTyping] = useState<string | null>(null)
  const go = (index: number) => onGo(Math.min(total - 1, Math.max(0, index)))

  return (
    <div className="page-navigator" role="toolbar" aria-label="ページと表示倍率">
      <button className="rail-button" disabled={current <= 0} onClick={() => go(current - 1)} title="前のページ">
        <Icon name="chevronUp" />
      </button>
      <input
        className="page-input"
        aria-label="ページ番号"
        inputMode="numeric"
        value={typing ?? String(current + 1)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setTyping(event.target.value)}
        onBlur={() => setTyping(null)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          const page = Number(typing)
          if (Number.isInteger(page)) go(page - 1)
          setTyping(null)
          event.currentTarget.blur()
        }}
      />
      <span className="page-total">/ {total}</span>
      <button className="rail-button" disabled={current >= total - 1} onClick={() => go(current + 1)} title="次のページ">
        <Icon name="chevronDown" />
      </button>
      <span className="navigator-divider" />
      <button className="rail-button" onClick={() => onZoom(stepZoom(zoom, -1))} title="縮小（⌘−）">
        <Icon name="zoomOut" />
      </button>
      <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      <button className="rail-button" onClick={() => onZoom(stepZoom(zoom, 1))} title="拡大（⌘＋）">
        <Icon name="zoomIn" />
      </button>
      <button className="rail-button" onClick={onFitWidth} title="幅に合わせる">
        <Icon name="fitWidth" />
      </button>
    </div>
  )
}

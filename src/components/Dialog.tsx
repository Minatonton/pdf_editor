import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** 画面の中央に出す板。外側を押すか × で閉じる */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="rail-button" onClick={onClose} title="閉じる" aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

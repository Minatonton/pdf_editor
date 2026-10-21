import type { Alignment } from '../editor/align'
import { Icon, type IconName } from './Icon'

const ALIGNMENTS: { how: Alignment; icon: IconName; title: string }[] = [
  { how: 'left', icon: 'alignLeft', title: '左揃え' },
  { how: 'centerX', icon: 'alignCenterX', title: '左右中央揃え' },
  { how: 'right', icon: 'alignRight', title: '右揃え' },
  { how: 'top', icon: 'alignTop', title: '上揃え' },
  { how: 'centerY', icon: 'alignCenterY', title: '上下中央揃え' },
  { how: 'bottom', icon: 'alignBottom', title: '下揃え' },
]

/** 2つ以上選んでいるときに書類の上に出す。揃える・等間隔に並べる・まとめて消す */
export function MultiSelectionBar({
  count,
  onAlign,
  onRemove,
}: {
  count: number
  onAlign: (how: Alignment) => void
  onRemove: () => void
}) {
  return (
    <div className="tool-context" role="toolbar" aria-label="選んだものの操作">
      <span className="tool-context-name">{count} 個を選択中</span>
      {ALIGNMENTS.map(({ how, icon, title }) => (
        <button key={how} className="rail-button" onClick={() => onAlign(how)} title={title} aria-label={title}>
          <Icon name={icon} />
        </button>
      ))}
      <span className="toolbar-divider" />
      <button className="rail-button" disabled={count < 3} onClick={() => onAlign('distributeX')} title="横に等間隔に並べる（3つ以上）" aria-label="横に等間隔">
        <Icon name="distributeX" />
      </button>
      <button className="rail-button" disabled={count < 3} onClick={() => onAlign('distributeY')} title="縦に等間隔に並べる（3つ以上）" aria-label="縦に等間隔">
        <Icon name="distributeY" />
      </button>
      <span className="toolbar-divider" />
      <button className="rail-button" data-danger onClick={onRemove} title="まとめて削除（Delete）" aria-label="まとめて削除">
        <Icon name="trash" />
      </button>
    </div>
  )
}

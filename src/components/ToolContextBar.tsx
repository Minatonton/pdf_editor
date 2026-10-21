import { entryIdOf, toolCategories } from '../editor/toolCatalog'
import type { Tool } from '../editor/tools'
import { Icon, type IconName } from './Icon'

/** 一覧に項目のない道具（画像を置く、トリミング）の名前とアイコン */
const OTHER_TOOLS: Record<string, { label: string; icon: IconName }> = {
  image: { label: '画像を追加', icon: 'image' },
  crop: { label: 'トリミング', icon: 'crop' },
}

/**
 * 道具を持っているあいだ、書類の上に道具の名前とやり方を出す。
 * 何を持っているのか、どうやめるのかが分からず、クリックするたびに意図しないものが置かれるのを防ぐ
 */
export function ToolContextBar({ tool, hint, onDone }: { tool: Tool; hint: string; onDone: () => void }) {
  const id = entryIdOf(tool)
  const entry = toolCategories()
    .flatMap((category) => category.entries)
    .find((candidate) => candidate.id === id)
  const { label, icon } = entry ?? OTHER_TOOLS[id] ?? { label: '道具', icon: 'select' }
  return (
    <div className="tool-context" role="status">
      <span className="tool-context-name">
        <Icon name={icon} size={18} />
        {label}
      </span>
      <span className="tool-context-hint">{hint}</span>
      <button className="primary small" onClick={onDone} title="道具を置いて、選択に戻る（Esc）">
        完了
      </button>
    </div>
  )
}

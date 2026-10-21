import { entryIdOf, toolCategories, type ToolEntry } from '../editor/toolCatalog'
import type { Tool } from '../editor/tools'
import { Icon } from './Icon'

/** よく使う道具だけを書類のすぐ横に浮かせる。左のパネルを畳んでいても、手元で持ち替えられるように */
const QUICK_ENTRY_IDS = ['note', 'highlight', 'pen', 'text', 'sign']

const SELECT_ENTRY: ToolEntry = { id: 'select', label: '選択', icon: 'select', title: '置いたものを選んで動かす（Esc）', run: { tool: { kind: 'select' } } }

export function QuickTools({ tool, onRun }: { tool: Tool; onRun: (entry: ToolEntry) => void }) {
  const all = toolCategories().flatMap((category) => category.entries)
  const entries = [SELECT_ENTRY, ...QUICK_ENTRY_IDS.map((id) => all.find((entry) => entry.id === id)!)]
  const activeId = entryIdOf(tool)
  return (
    <div className="quick-tools" role="toolbar" aria-label="よく使う道具">
      {entries.map((entry) => (
        <button
          key={entry.id}
          className="rail-button"
          aria-pressed={entry.id === activeId}
          onClick={() => onRun(entry)}
          title={`${entry.label}：${entry.title}`}
          aria-label={entry.label}
        >
          <Icon name={entry.icon} />
        </button>
      ))}
    </div>
  )
}

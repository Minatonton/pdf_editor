import { useState } from 'react'
import { entryIdOf, toolCategories, type ToolEntry } from '../editor/toolCatalog'
import type { Tool } from '../editor/tools'
import { Icon } from './Icon'

/**
 * 左の「すべてのツール」。分類ごとに開閉でき、パネルごと細い帯に畳める。
 * 書類を広く見たいときに邪魔にならず、畳んでもアイコンで道具を選べるようにするため
 */
export function ToolsPanel({
  tool,
  onRun,
}: {
  tool: Tool
  onRun: (entry: ToolEntry) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const activeId = entryIdOf(tool)
  const categories = toolCategories()

  if (collapsed) {
    return (
      <nav className="tools-panel collapsed" aria-label="すべてのツール">
        <button className="rail-button" onClick={() => setCollapsed(false)} title="ツールの一覧を開く">
          <Icon name="panelLeft" />
        </button>
        {categories.flatMap((category) => category.entries).map((entry) => (
          <button key={entry.id} className="rail-button" aria-pressed={entry.id === activeId} onClick={() => onRun(entry)} title={`${entry.label}：${entry.title}`}>
            <Icon name={entry.icon} />
          </button>
        ))}
      </nav>
    )
  }

  return (
    <nav className="tools-panel" aria-label="すべてのツール">
      <div className="panel-header">
        <h2>すべてのツール</h2>
        <button className="rail-button" onClick={() => setCollapsed(true)} title="ツールの一覧を畳む">
          <Icon name="panelLeft" />
        </button>
      </div>
      {categories.map((category) => {
        const open = !closed.has(category.id)
        return (
          <section key={category.id} className="tool-category">
            <button
              className="category-header"
              aria-expanded={open}
              onClick={() => {
                const next = new Set(closed)
                if (open) next.add(category.id)
                else next.delete(category.id)
                setClosed(next)
              }}
            >
              <Icon name={category.icon} />
              <span>{category.label}</span>
              <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
            </button>
            {open && (
              <ul>
                {category.entries.map((entry) => (
                  <li key={entry.id}>
                    <button className="tool-entry" aria-pressed={entry.id === activeId} onClick={() => onRun(entry)} title={entry.title}>
                      <Icon name={entry.icon} />
                      <span>{entry.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </nav>
  )
}

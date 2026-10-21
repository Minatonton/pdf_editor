import { MIN_IMAGE_WIDTH, type Annotation, type TextAnnotation } from './types'

export interface History {
  past: Annotation[][]
  present: Annotation[]
  future: Annotation[][]
  /** 直前の操作が文字の編集だったときの対象。続けて同じものを編集したら1回の操作にまとめる */
  editingTextId?: string
}

export type HistoryAction =
  | { type: 'add'; annotation: Annotation }
  | { type: 'move'; id: string; dx: number; dy: number }
  | { type: 'resizeImage'; id: string; width: number }
  | { type: 'editText'; id: string; changes: Partial<Pick<TextAnnotation, 'text' | 'fontSize' | 'color'>> }
  | { type: 'remove'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }

export const EMPTY_HISTORY: History = { past: [], present: [], future: [] }

function commit(history: History, present: Annotation[]): History {
  return { past: [...history.past, history.present], present, future: [] }
}

function update(history: History, id: string, change: (annotation: Annotation) => Annotation): History {
  return commit(
    history,
    history.present.map((annotation) => (annotation.id === id ? change(annotation) : annotation)),
  )
}

export function historyReducer(history: History, action: HistoryAction): History {
  switch (action.type) {
    case 'add':
      return commit(history, [...history.present, action.annotation])
    case 'move':
      return update(history, action.id, (a) => ({ ...a, x: a.x + action.dx, y: a.y + action.dy }))
    case 'resizeImage':
      return update(history, action.id, (a) => {
        if (a.kind !== 'image') return a
        const width = Math.max(MIN_IMAGE_WIDTH, action.width)
        return { ...a, width, height: (a.height * width) / a.width }
      })
    case 'editText': {
      const edit = (a: Annotation) => (a.id === action.id && a.kind === 'text' ? { ...a, ...action.changes } : a)
      if (history.editingTextId === action.id) return { ...history, present: history.present.map(edit) }
      return { ...commit(history, history.present.map(edit)), editingTextId: action.id }
    }
    case 'remove':
      return commit(
        history,
        history.present.filter((annotation) => annotation.id !== action.id),
      )
    case 'undo': {
      const previous = history.past.at(-1)
      if (!previous) return history
      return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] }
    }
    case 'redo': {
      const [next, ...rest] = history.future
      if (!next) return history
      return { past: [...history.past, history.present], present: next, future: rest }
    }
    case 'reset':
      return EMPTY_HISTORY
  }
}

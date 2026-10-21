import { MIN_BOX_SIZE, type Annotation, type RectStyle, type TextAnnotation } from '../annotations/types'
import { normalizeRotation, type Rotation } from '../pdf/geometry'

/** 保存する PDF の1ページ。どのファイルの何ページ目を、どの向きで使うか */
export interface PageRef {
  id: string
  file: number
  index: number
  /** 元の PDF の /Rotate を含めた、表示と保存に使う最終的な向き */
  rotation: Rotation
  /** 回転させる前（/Rotate が 0 のとき）の幅と高さ */
  width: number
  height: number
}

export interface EditorDocument {
  pages: PageRef[]
  annotations: Annotation[]
}

export interface History {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
  /** 直前の操作が文字の編集だったときの対象。続けて同じものを編集したら1回の操作にまとめる */
  editingTextId?: string
}

export type EditorAction =
  | { type: 'open'; pages: PageRef[] }
  | { type: 'add'; annotation: Annotation }
  | { type: 'move'; id: string; dx: number; dy: number }
  /** 画像は縦横比を保つので height を使わない */
  | { type: 'resize'; id: string; width: number; height: number }
  | { type: 'editRect'; id: string; changes: Partial<RectStyle> }
  | { type: 'editText'; id: string; changes: Partial<Pick<TextAnnotation, 'text' | 'fontSize' | 'color'>> }
  | { type: 'remove'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }

export const EMPTY_HISTORY: History = { past: [], present: { pages: [], annotations: [] }, future: [] }

export function viewSizeOf(page: PageRef): { width: number; height: number } {
  const turned = page.rotation === 90 || page.rotation === 270
  return turned ? { width: page.height, height: page.width } : { width: page.width, height: page.height }
}

export function rotateBy(rotation: Rotation, degrees: number): Rotation {
  return normalizeRotation(rotation + degrees)
}

function commit(history: History, present: EditorDocument): History {
  return { past: [...history.past, history.present], present, future: [] }
}

function updateAnnotation(history: History, id: string, change: (annotation: Annotation) => Annotation): History {
  const { present } = history
  return commit(history, {
    ...present,
    annotations: present.annotations.map((annotation) => (annotation.id === id ? change(annotation) : annotation)),
  })
}

export function editorReducer(history: History, action: EditorAction): History {
  const { present } = history
  switch (action.type) {
    case 'open':
      return { past: [], present: { pages: action.pages, annotations: [] }, future: [] }
    case 'add':
      return commit(history, { ...present, annotations: [...present.annotations, action.annotation] })
    case 'move':
      return updateAnnotation(history, action.id, (a) => ({ ...a, x: a.x + action.dx, y: a.y + action.dy }))
    case 'resize':
      return updateAnnotation(history, action.id, (a) => {
        const width = Math.max(MIN_BOX_SIZE, action.width)
        if (a.kind === 'image') return { ...a, width, height: (a.height * width) / a.width }
        if (a.kind === 'rect') return { ...a, width, height: Math.max(MIN_BOX_SIZE, action.height) }
        return a
      })
    case 'editRect':
      return updateAnnotation(history, action.id, (a) => (a.kind === 'rect' ? { ...a, ...action.changes } : a))
    case 'editText': {
      const edit = (a: Annotation) => (a.id === action.id && a.kind === 'text' ? { ...a, ...action.changes } : a)
      const edited = { ...present, annotations: present.annotations.map(edit) }
      if (history.editingTextId === action.id) return { ...history, present: edited }
      return { ...commit(history, edited), editingTextId: action.id }
    }
    case 'remove':
      return commit(history, { ...present, annotations: present.annotations.filter((a) => a.id !== action.id) })
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
  }
}

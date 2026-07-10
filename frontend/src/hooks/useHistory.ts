import { useCallback, useState } from 'react'
import type { TaskResult } from '../api'
import { HISTORY_KEY, HISTORY_MAX } from '../constants'
import type { HistoryEntry, HistoryImage, TrackedTask } from '../types'

const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Persist completed batches (only successfully generated images) so users can
// revisit past results across sessions.
export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())

  const addEntry = useCallback((tracked: TrackedTask[], res: Record<string, TaskResult>) => {
    const images: HistoryImage[] = tracked
      .map((t) => {
        const url = res[t.taskId]?.results?.[0]?.url
        return url ? { label: `${t.itemName} · ${t.templateName}`, url } : null
      })
      .filter((x): x is HistoryImage => x !== null)
    if (images.length === 0) return
    const names = Array.from(new Set(tracked.map((t) => t.itemName)))
    const title =
      names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')} 等 ${names.length} 个商品`
    const entry: HistoryEntry = {
      id: `h-${Date.now()}`,
      ts: Date.now(),
      title: `${title} · ${images.length} 张`,
      images,
    }
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // storage full / unavailable — keep in-memory only
      }
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { history, addEntry, clearHistory }
}

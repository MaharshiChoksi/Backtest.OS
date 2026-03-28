import { create } from 'zustand'

const STORAGE_KEY = 'backtestos_journal_v1'

const persist = (notes) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)) } catch { /* quota exceeded */ }
}

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export const useJournalStore = create((set, get) => ({
  notes: load(),

  /**
   * Add a new note entry. Auto-assigns id and createdAt timestamp.
   * @param {{ barIdx, barTime, text }} data
   */
  addNote: (data) => {
    const entry   = { ...data, id: Date.now(), createdAt: new Date().toISOString() }
    const updated = [...get().notes, entry]
    persist(updated)
    set({ notes: updated })
    return entry.id
  },

  removeNote: (id) => {
    const updated = get().notes.filter((n) => n.id !== id)
    persist(updated)
    set({ notes: updated })
  },

  /** Wipe all notes from state AND localStorage */
  clearAll: () => {
    persist([])
    set({ notes: [] })
  },

  /** Download all notes as a UTF-8 CSV with comma delimiter */
  exportCSV: () => {
    const { notes } = get()
    if (!notes.length) return
    const headers = ['id', 'barIdx', 'barTime', 'text', 'createdAt']
    const esc     = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows    = notes.map((n) => headers.map((h) => esc(n[h])).join(','))
    const csv     = [headers.join(','), ...rows].join('\n')
    const a       = document.createElement('a')
    a.href        = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download    = `backtestos_journal_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  },
}))
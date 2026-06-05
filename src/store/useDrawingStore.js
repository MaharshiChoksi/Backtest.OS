import { create } from 'zustand'
import { DrawingManager, TOOL_DEFINITIONS, getToolRegistry } from 'lightweight-charts-drawing'

/**
 * ARCHITECTURE NOTE
 * -----------------
 * The library does NOT have a built-in interactive drawing mode.
 * DrawingManager has no setActiveTool(). The entire interaction loop —
 * click collection, anchor counting, preview rubber-band, final drawing
 * creation — must be implemented manually by the consuming app.
 *
 * This store handles:
 *   1. Active tool selection (just state — ChartPane reads it)
 *   2. A Map of DrawingManager instances, one per chartId
 *   3. Aggregated drawings list for the sidebar
 *
 * The actual mouse interaction lives in ChartPane's useEffect, which
 * attaches/removes click+mousemove handlers whenever activeTool changes.
 */

const managers = new Map()  // chartId -> DrawingManager
let isSyncing = false  // prevent recursive sync loops
let syncTimeout = null  // debounce timer

const toolLabelMap = {}
if (TOOL_DEFINITIONS && Array.isArray(TOOL_DEFINITIONS)) {
  TOOL_DEFINITIONS.forEach((t) => { toolLabelMap[t.type] = t.name })
}

function syncDrawingsAcrossAll() {
  if (isSyncing) return
  isSyncing = true
  
  try {
    const registry = getToolRegistry()
    const drawingsByChart = new Map()
    
    managers.forEach((mgr, chartId) => {
      drawingsByChart.set(chartId, mgr.exportDrawings?.() || [])
    })
    
    const allDrawings = new Map()
    drawingsByChart.forEach((drawings) => {
      drawings.forEach((d) => {
        if (!allDrawings.has(d.id)) {
          allDrawings.set(d.id, d)
        }
      })
    })
    
    const registry_get = registry.get.bind(registry)
    managers.forEach((mgr, chartId) => {
      const currentIds = new Set((drawingsByChart.get(chartId) || []).map(d => d.id))
      const targetIds = new Set(allDrawings.keys())
      const toAdd = Array.from(targetIds).filter(id => !currentIds.has(id))
      
      if (toAdd.length > 0) {
        const toImport = toAdd.map(id => allDrawings.get(id))
        try {
          mgr.importDrawings(toImport, (type, data) => {
            const def = registry_get(type)
            if (!def) return null
            if (def.factory) return def.factory(data.id, data.anchors, data.style, data.options)
            if (def.class) return new def.class(data.id, data.anchors, data.style, data.options)
            return null
          })
        } catch (err) {
          console.error(`Failed to import drawings to chart ${chartId}:`, err)
        }
      }
    })
  } finally {
    isSyncing = false
  }
}

function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    syncDrawingsAcrossAll()
  }, 25)  // Small delay to ensure drawing is committed
}

function aggregateDrawings() {
  const all = []
  const seen = new Set()
  managers.forEach((mgr) => {
    ;(mgr.getAllDrawings?.() || []).forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        all.push({ id: d.id, type: d.type, typeLabel: toolLabelMap[d.type] || d.type })
      }
    })
  })
  return all
}

export const useDrawingStore = create((set, get) => ({
  activeTool: null,  // null = cursor mode
  drawings: [],

  setActiveTool: (toolId) => {
    set({ activeTool: toolId === 'cursor' ? null : toolId })
  },

  // Returns the manager instance so ChartPane can use it directly for interaction
  initManager: (chartId, chart, series, container) => {
    if (managers.has(chartId)) {
      managers.get(chartId).detach()
      managers.delete(chartId)
    }
    const manager = new DrawingManager()
    manager.attach(chart, series, container)
    managers.set(chartId, manager)

    const sync = () => {
      set({ drawings: aggregateDrawings() })
      debouncedSync()
    }
    manager.on('drawing:added',   sync)
    manager.on('drawing:removed', sync)
    manager.on('drawing:updated', sync)
    manager.on('drawing:cleared', sync)

    debouncedSync()
    return manager
  },

  destroyManager: (chartId) => {
    if (managers.has(chartId)) {
      managers.get(chartId).detach()
      managers.delete(chartId)
    }
    set({ drawings: aggregateDrawings() })
    if (managers.size === 0) set({ activeTool: null, drawings: [] })
  },

  destroyAllManagers: () => {
    managers.forEach((mgr) => mgr.detach())
    managers.clear()
    set({ activeTool: null, drawings: [] })
  },

  addDrawingToAll: (sourceChartId, tool, id, anchors, style, options) => {
    const registry = getToolRegistry()
    const sourceManager = managers.get(sourceChartId)
    if (!sourceManager) return

    try {
      const drawing = registry.createDrawing(tool, id, anchors, style, options)
      if (drawing) {
        sourceManager.addDrawing(drawing)
      }
    } catch (_) {}
  },

  removeDrawing: (id) => {
    managers.forEach((mgr) => { try { mgr.removeDrawing(id) } catch (_) {} })
  },

  clearAll: () => { managers.forEach((mgr) => mgr.clearAll()) },

  selectDrawing: (id) => {
    managers.forEach((mgr) => { try { mgr.selectDrawing(id) } catch (_) {} })
  },

  deselectAll: () => { managers.forEach((mgr) => mgr.deselectAll()) },

  exportDrawings: () => {
    const all = []
    managers.forEach((mgr) => { all.push(...(mgr.exportDrawings?.() || [])) })
    return all
  },

  importDrawings: (json) => {
    if (!managers.size) return
    const registry = getToolRegistry()
    managers.forEach((mgr) => {
      try {
        mgr.importDrawings(json, (type, data) => {
          const def = registry.get(type)
          return def ? new def.class(data.id, data.anchors, data.style, data.options) : null
        })
      } catch (_) {}
    })
  },

  getManager: (chartId) => managers.get(chartId),
}))

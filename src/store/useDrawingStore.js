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

const toolLabelMap = {}
if (TOOL_DEFINITIONS && Array.isArray(TOOL_DEFINITIONS)) {
  TOOL_DEFINITIONS.forEach((t) => { toolLabelMap[t.type] = t.name })
}

function aggregateDrawings() {
  const all = []
  managers.forEach((mgr) => {
    ;(mgr.getAllDrawings?.() || []).forEach((d) => {
      all.push({ id: d.id, type: d.type, typeLabel: toolLabelMap[d.type] || d.type })
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

    const sync = () => set({ drawings: aggregateDrawings() })
    manager.on('drawing:added',   sync)
    manager.on('drawing:removed', sync)
    manager.on('drawing:updated', sync)
    manager.on('drawing:cleared', sync)

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
    const firstMgr = managers.values().next().value
    if (!firstMgr) return
    const registry = getToolRegistry()
    firstMgr.importDrawings(json, (type, data) => {
      const def = registry.getTool(type)
      return def ? new def.class(data.id, data.anchors, data.style, data.options) : null
    })
  },

  getManager: (chartId) => managers.get(chartId),
}))

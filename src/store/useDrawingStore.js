import { create } from 'zustand'
import { DrawingManager, TOOL_DEFINITIONS } from 'lightweight-charts-drawing'

// Module-level manager (not serializable, can't live in zustand state)
let managerInstance = null

// Build tool label map from TOOL_DEFINITIONS
const toolLabelMap = {}
if (TOOL_DEFINITIONS && Array.isArray(TOOL_DEFINITIONS)) {
  TOOL_DEFINITIONS.forEach((tool) => {
    toolLabelMap[tool.type] = tool.name
  })
}

export const useDrawingStore = create((set, get) => ({
  // Serialized state
  activeTool: null, // null = cursor mode, string = tool type (e.g., 'TrendLine')
  drawings: [], // { id, type, typeLabel }[]

  // Set active tool and sync with manager
  setActiveTool: (toolId) => {
    const normalized = toolId === 'cursor' ? null : toolId
    set({ activeTool: normalized })
    if (managerInstance) {
      managerInstance.setActiveTool(normalized)
    }
  },

  // Initialize DrawingManager and attach to chart
  initManager: (chart, series, container) => {
    if (managerInstance) {
      managerInstance.detach()
    }
    const manager = new DrawingManager()
    manager.attach(chart, series, container)
    managerInstance = manager

    // Subscribe to manager events to sync drawings list
    const updateDrawings = () => {
      const all = manager.getAllDrawings()
      set({
        drawings: all.map((d) => ({
          id: d.id,
          type: d.type,
          typeLabel: toolLabelMap[d.type] || d.type,
        })),
      })
    }

    manager.on('drawing:added', updateDrawings)
    manager.on('drawing:removed', updateDrawings)
    manager.on('drawing:updated', updateDrawings)
    manager.on('drawing:cleared', () => {
      set({ drawings: [] })
    })

    // Restore active tool if set
    const { activeTool } = get()
    if (activeTool) {
      manager.setActiveTool(activeTool)
    }
  },

  // Remove a drawing by id
  removeDrawing: (id) => {
    if (managerInstance) {
      managerInstance.removeDrawing(id)
    }
  },

  // Clear all drawings
  clearAll: () => {
    if (managerInstance) {
      managerInstance.clearAll()
    }
  },

  // Select a drawing
  selectDrawing: (id) => {
    if (managerInstance) {
      managerInstance.selectDrawing(id)
    }
  },

  // Deselect all drawings
  deselectAll: () => {
    if (managerInstance) {
      managerInstance.deselectAll()
    }
  },

  // Export drawings as JSON
  exportDrawings: () => {
    if (managerInstance) {
      return managerInstance.exportDrawings()
    }
    return []
  },

  // Import drawings from JSON
  importDrawings: (json) => {
    if (managerInstance) {
      const registry = getToolRegistry()
      managerInstance.importDrawings(json, (type, data) => {
        const def = registry.getTool(type)
        if (def) {
          return new def.class(data.id, data.anchors, data.style, data.options)
        }
        return null
      })
    }
  },

  // Get the manager instance (for advanced usage)
  getManager: () => managerInstance,

  // Cleanup on unmount
  destroyManager: () => {
    if (managerInstance) {
      managerInstance.detach()
      managerInstance = null
    }
    set({ activeTool: null, drawings: [] })
  },
}))

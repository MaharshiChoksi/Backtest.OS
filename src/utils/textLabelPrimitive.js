export class TextLabelPrimitive {
  constructor() {
    this._labels = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = null
  }

  setLabels(labels) {
    this._labels = labels
    if (this._requestUpdate) this._requestUpdate()
  }

  clearLabels() {
    this._labels = []
    if (this._requestUpdate) this._requestUpdate()
  }

  attached(param) {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  paneViews() {
    if (!this._paneView) this._paneView = new TextLabelPaneView(this)
    return [this._paneView]
  }

  updateAllViews() {}
}

class TextLabelPaneView {
  constructor(primitive) {
    this._primitive = primitive
  }

  zOrder() { return 'top' }

  renderer() {
    return new TextLabelRenderer(this._primitive)
  }
}

class TextLabelRenderer {
  constructor(primitive) {
    this._primitive = primitive
  }

  draw(target) {
    const chart = this._primitive._chart
    const series = this._primitive._series
    const labels = this._primitive._labels
    if (!chart || !series || !labels.length) return
    const timeScale = chart.timeScale()
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hPR = scope.horizontalPixelRatio
      const vPR = scope.verticalPixelRatio
      ctx.save()
      ctx.scale(hPR, vPR)
      ctx.textBaseline = 'middle'
      ctx.font = '11px monospace'
      for (const lbl of labels) {
        const tIdx = timeScale.timeToIndex(lbl.time, true)
        if (tIdx == null) continue
        const px = timeScale.logicalToCoordinate(tIdx)
        const py = series.priceToCoordinate(lbl.price)
        if (px == null || py == null) continue
        ctx.fillStyle = lbl.color
        ctx.fillText(lbl.text, px, py)
      }
      ctx.restore()
    })
  }
}

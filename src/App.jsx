import { useEffect, useState } from 'react'
import { useSimStore } from './store/useSimStore'
import { UploadScreen } from './components/upload/UploadScreen'
import { Workspace } from './components/layout/Workspace'
import { AnalysisScreen } from './components/analysis/AnalysisScreen'
import { JournalRoute } from './components/journal/JournalRoute'
import { clearCache } from './utils/parser'

export default function App() {
  const [route, setRoute] = useState('backtest')

  useEffect(() => {
    clearCache()
  }, [])

  const hasBars = useSimStore((s) => s.bars.length > 0)
  const analysisMode = useSimStore((s) => s.analysisMode)
  const clearSession = useSimStore((s) => s.clearSession)

  if (route === 'journal') {
    return <JournalRoute onBack={() => setRoute('backtest')} />
  }

  // Show upload screen if no bars and not in analysis mode
  if (!hasBars && !analysisMode) {
    return <UploadScreen onOpenJournal={() => setRoute('journal')} />
  }

  // Show analysis screen if in analysis mode
  if (analysisMode) return <AnalysisScreen onExit={clearSession} />

  return <Workspace onLoadNew={clearSession} />
}
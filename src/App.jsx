import { useSimStore }    from './store/useSimStore'
import { UploadScreen }   from './components/upload/UploadScreen'
import { Workspace }      from './components/layout/Workspace'

export default function App() {
  const hasBars      = useSimStore((s) => s.bars.length > 0)
  const analysisMode = useSimStore((s) => s.analysisMode)
  const clearSession = useSimStore((s) => s.clearSession)

  // Show upload screen if no bars and not in analysis mode
  if (!hasBars && !analysisMode) return <UploadScreen />

  return <Workspace onLoadNew={clearSession} />
}
import { useSimStore }    from './store/useSimStore'
import { UploadScreen }   from './components/upload/UploadScreen'
import { Workspace }      from './components/layout/Workspace'

export default function App() {
  const hasBars      = useSimStore((s) => s.bars.length > 0)
  const clearSession = useSimStore((s) => s.clearSession)
  const resetTrades  = useSimStore(() => {
    // import inline to avoid circular reference — only reset trades on new load
    return () => {}
  })

  if (!hasBars) return <UploadScreen />

  return <Workspace onLoadNew={clearSession} />
}
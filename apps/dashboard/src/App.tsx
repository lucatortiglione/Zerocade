import { BrowserRouter, Route, Routes } from 'react-router'
import { LeftRail } from './components/LeftRail'
import { DjPadPage } from './pages/DjPadPage'
import { GamesPage } from './pages/GamesPage'
import { GiftsPage } from './pages/GiftsPage'
import { SetupPage } from './pages/SetupPage'
import { SourcesPage } from './pages/SourcesPage'
import { clearRuntimeIssue, useDashboard } from './store'

function RuntimeIssue() {
  const { runtimeIssue } = useDashboard()
  return runtimeIssue ? <aside className="runtime-issue" role="alert">{runtimeIssue}
    <button type="button" className="btn btn--small" onClick={clearRuntimeIssue}>Chiudi avviso</button>
  </aside> : null
}

export function App() {
  return (
    <BrowserRouter>
      <RuntimeIssue />
      <div className="shell">
        <LeftRail />
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/dj" element={<DjPadPage />} />
          <Route path="/gifts" element={<GiftsPage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

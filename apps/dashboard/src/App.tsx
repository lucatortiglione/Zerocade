import { BrowserRouter, Route, Routes } from 'react-router'
import { LeftRail } from './components/LeftRail'
import { GamesPage } from './pages/GamesPage'
import { SetupPage } from './pages/SetupPage'

export function App() {
  return (
    <BrowserRouter>
      <div className="shell">
        <LeftRail />
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

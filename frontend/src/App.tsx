import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import ConfigPage from './pages/ConfigPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analysis/:videoId" element={<AnalysisPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/config" element={<ConfigPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

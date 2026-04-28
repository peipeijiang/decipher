import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import ConfigPage from './pages/ConfigPage'
import CreativePage from './pages/CreativePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analysis/:videoId" element={<AnalysisPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/creative" element={<CreativePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

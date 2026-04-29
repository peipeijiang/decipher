import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'
import ConfigPage from './pages/ConfigPage'
import CreativePage from './pages/CreativePage'
import CreativeHistoryPage from './pages/CreativeHistoryPage'
import ProductPage from './pages/ProductPage'
import ProductListPage from './pages/ProductListPage'
import WorkbenchPage from './pages/WorkbenchPage'

// Redirect /analysis/:videoId → /replica/:videoId
function LegacyAnalysisRedirect() {
  const { videoId } = useParams()
  return <Navigate to={`/replica/${videoId}`} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/replica/new" replace />} />

        {/* 爆款复刻 */}
        <Route path="/replica/new" element={<HomePage />} />
        <Route path="/replica/history" element={<HistoryPage />} />
        <Route path="/replica/:videoId" element={<AnalysisPage />} />

        {/* 创意生成 */}
        <Route path="/creative/new" element={<CreativePage />} />
        <Route path="/creative/history" element={<CreativeHistoryPage />} />

        {/* 产品视频 */}
        <Route path="/product/new" element={<ProductPage />} />
        <Route path="/product/history" element={<ProductListPage />} />
        <Route path="/product/:id" element={<ProductPage />} />

        {/* 工作台 */}
        <Route path="/workbench" element={<WorkbenchPage />} />

        {/* 设置 */}
        <Route path="/config" element={<ConfigPage />} />

        {/* Legacy redirects */}
        <Route path="/analysis/:videoId" element={<LegacyAnalysisRedirect />} />
        <Route path="/history" element={<Navigate to="/replica/history" replace />} />
        <Route path="/creative" element={<Navigate to="/creative/new" replace />} />
        <Route path="/products" element={<Navigate to="/product/history" replace />} />
        <Route path="/product" element={<Navigate to="/product/new" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

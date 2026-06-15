import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import ConfigPage from './pages/ConfigPage'
import CreativePage from './pages/CreativePage'
import ProductPage from './pages/ProductPage'
import VideoGenPage from './pages/VideoGenPage'
import WorkbenchPage from './pages/WorkbenchPage'
import TemplateSettingsPage from './pages/TemplateSettingsPage'
import AgentWorkflowPage from './pages/AgentWorkflowPage'

// Redirect /analysis/:videoId → /replica/:videoId
function LegacyAnalysisRedirect() {
  const { videoId } = useParams()
  return <Navigate to={`/replica/${videoId}`} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Dashboard — new home */}
        <Route path="/" element={<DashboardPage />} />

        {/* 爆款复刻 */}
        <Route path="/replica/new" element={<HomePage />} />
        <Route path="/replica/:videoId" element={<AnalysisPage />} />

        {/* 创意生成 */}
        <Route path="/creative/new" element={<CreativePage />} />

        {/* 产品视频 */}
        <Route path="/product/new" element={<ProductPage />} />
        <Route path="/product/:id" element={<ProductPage />} />

        {/* 视频生成 */}
        <Route path="/video-gen" element={<VideoGenPage />} />

        {/* 工作台 */}
        <Route path="/workbench" element={<WorkbenchPage />} />

        {/* 设置 */}
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/settings/templates" element={<TemplateSettingsPage />} />
        <Route path="/agent-workflow" element={<AgentWorkflowPage />} />

        {/* Legacy redirects */}
        <Route path="/analysis/:videoId" element={<LegacyAnalysisRedirect />} />
        <Route path="/history" element={<Navigate to="/workbench" replace />} />
        <Route path="/replica/history" element={<Navigate to="/workbench" replace />} />
        <Route path="/creative/history" element={<Navigate to="/workbench" replace />} />
        <Route path="/product/history" element={<Navigate to="/workbench" replace />} />
        <Route path="/creative" element={<Navigate to="/creative/new" replace />} />
        <Route path="/products" element={<Navigate to="/workbench" replace />} />
        <Route path="/product" element={<Navigate to="/product/new" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

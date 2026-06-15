import axios from 'axios'
import type { Product, ProductPrompt, ProductProgress, ProductDoc, VideoTemplate } from '../types/product'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
})

export default api

export const getVideoTemplates = () =>
  api.get<{ templates: VideoTemplate[] }>('/api/products/templates').then(r => r.data.templates)

export const getHookTemplates = () =>
  api.get<{ id: string; key: string; name: string }[]>('/api/templates/hook').then(r => r.data)

export const getImageLayoutTemplates = () =>
  api.get<{ id: string; key: string; name: string }[]>('/api/templates/image-layout?active_only=true').then(r => r.data)

export const createProduct = (url: string) =>
  api.post<Product>('/api/products/create', { url }).then(r => r.data)

export const getProducts = (status?: string) =>
  api.get<Product[]>('/api/products', { params: status ? { status } : {} }).then(r => r.data)

export const getProduct = (id: string) =>
  api.get<Product>(`/api/products/${id}`).then(r => r.data)

export const getProductProgress = (id: string) =>
  api.get<ProductProgress>(`/api/products/${id}/progress`).then(r => r.data)

export const deleteProduct = (id: string) =>
  api.delete(`/api/products/${id}`).then(r => r.data)

export const getProductDocJson = (id: string) =>
  api.get<ProductDoc>(`/api/products/${id}/doc/json`).then(r => r.data)

export const getProductPrompts = (id: string) =>
  api.get<ProductPrompt[]>(`/api/products/${id}/prompts`).then(r => r.data)

export const triggerImageGeneration = (promptId: string, options?: { grid_layout?: string; aspect_ratio?: string }) =>
  api.post(`/api/products/prompts/${promptId}/generate-image`, options || {}).then(r => r.data)

export const triggerVideoGeneration = (promptId: string) =>
  api.post(`/api/products/prompts/${promptId}/generate-video`).then(r => r.data)

export const getProductImageUrl = (productId: string, filename: string) =>
  `${API_BASE}/api/products/${productId}/images/${filename}`

export const getGeneratedImageUrl = (promptId: string) =>
  `${API_BASE}/api/products/prompts/${promptId}/image`

export const updatePrompt = (promptId: string, promptText: string, extra?: { grid_layout?: string; aspect_ratio?: string; video_style?: string; video_model?: string; video_duration?: number }) =>
  api.patch(`/api/products/prompts/${promptId}`, { prompt_text: promptText, ...extra }).then(r => r.data)

export const regeneratePrompt = (promptId: string, templateKey: string, hookKey?: string) =>
  api.post(`/api/products/prompts/${promptId}/regenerate`, { template_key: templateKey, hook_key: hookKey ?? null }).then(r => r.data)

export const refinePrompt = (promptId: string, instruction: string) =>
  api.post(`/api/products/prompts/${promptId}/refine`, { instruction }).then(r => r.data)

export const archiveProduct = (id: string) =>
  api.patch<Product>(`/api/products/${id}/archive`).then(r => r.data)

export const activateProduct = (id: string) =>
  api.patch<Product>(`/api/products/${id}/activate`).then(r => r.data)

export const triggerBatchVideoGeneration = (productId: string) =>
  api.post(`/api/products/${productId}/generate-videos`).then(r => r.data)

export const rerunProduct = (id: string) =>
  api.post<Product>(`/api/products/${id}/rerun`).then(r => r.data)

export const resumeProduct = (id: string) =>
  api.post<Product>(`/api/products/${id}/resume`).then(r => r.data)

export const cancelTask = (promptId: string, type: 'image' | 'video' | 'all' = 'all') =>
  api.post(`/api/products/prompts/${promptId}/cancel`, { type }).then(r => r.data)

export const triggerBatchImageGeneration = (productId: string) =>
  api.post(`/api/products/${productId}/generate-images`).then(r => r.data)

export const generatePrompts = (productId: string, templateKey?: string) =>
  api.post(`/api/products/${productId}/generate-prompts`, templateKey ? { template_key: templateKey } : {}).then(r => r.data)

// --- Video Generation (standalone) ---
import type { VideoGeneration, VideoGenListResponse } from '../types/videoGen'

export const createVideoGen = (data: { prompt: string; reference_image?: string; model: string; aspect_ratio: string; duration: number }) =>
  api.post<VideoGeneration>('/api/video-gen/create', data).then(r => r.data)

export const getVideoGenList = (params?: { model?: string; status?: string; limit?: number; offset?: number }) =>
  api.get<VideoGenListResponse>('/api/video-gen', { params }).then(r => r.data)

export const getVideoGenStatus = (id: string) =>
  api.get<VideoGeneration>(`/api/video-gen/${id}`).then(r => r.data)

export const retryVideoGen = (id: string) =>
  api.post<VideoGeneration>(`/api/video-gen/${id}/retry`).then(r => r.data)

export const deleteVideoGen = (id: string) =>
  api.delete(`/api/video-gen/${id}`).then(r => r.data)

export const uploadVideoGenRef = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<{ path: string; filename: string }>('/api/video-gen/upload-ref', form).then(r => r.data)
}

// --- Agent Prompts ---

export interface AgentPrompt {
  id: string
  key: string
  name: string
  description: string
  system_prompt: string
  user_prompt_template: string
  variables: string  // JSON array of variable names
  is_custom: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export const getAgentPrompts = () =>
  api.get<AgentPrompt[]>('/api/agent-prompts').then(r => r.data)

export const updateAgentPrompt = (
  id: string,
  data: { system_prompt?: string; user_prompt_template?: string; is_active?: boolean }
) => api.patch<AgentPrompt>(`/api/agent-prompts/${id}`, data).then(r => r.data)

export const resetAgentPrompt = (id: string) =>
  api.post<AgentPrompt>(`/api/agent-prompts/${id}/reset`).then(r => r.data)

// --- Storyboard Replication ---

export const createStoryboardReplication = (videoId: string) =>
  api.post(`/api/storyboard/create?video_id=${videoId}`).then(r => r.data)

export const getStoryboardReplication = (id: string) =>
  api.get(`/api/storyboard/${id}`).then(r => r.data)

export const generateStoryboardReplacement = (
  id: string,
  file: File,
  description: string
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('description', description)
  return api.post(`/api/storyboard/${id}/generate`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getStoryboardHistory = (limit = 50) =>
  api.get(`/api/storyboard/history?limit=${limit}`).then(r => r.data)

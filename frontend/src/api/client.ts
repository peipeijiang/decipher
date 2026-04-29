import axios from 'axios'
import type { Product, ProductPrompt, ProductProgress, ProductDoc } from '../types/product'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
})

export default api

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

export const triggerImageGeneration = (promptId: string) =>
  api.post(`/api/products/prompts/${promptId}/generate-image`).then(r => r.data)

export const triggerVideoGeneration = (promptId: string) =>
  api.post(`/api/products/prompts/${promptId}/generate-video`).then(r => r.data)

export const getProductImageUrl = (productId: string, filename: string) =>
  `${API_BASE}/api/products/${productId}/images/${filename}`

export const getGeneratedImageUrl = (promptId: string) =>
  `${API_BASE}/api/products/prompts/${promptId}/image`

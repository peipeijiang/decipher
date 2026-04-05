import { useState } from 'react'
import api from '../api/client'

export function useVideos() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const upload = async (file: File) => {
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/api/videos/upload', formData, {
        onUploadProgress: e => setProgress(Math.round((e.loaded * 100) / (e.total || 1)),
      })
      return res.data
    } catch (e: any) {
      setError(e.response?.data?.detail || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading, progress, error }
}

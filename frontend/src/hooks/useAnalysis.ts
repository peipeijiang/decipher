import { useState, useEffect } from 'react'
import api from '../api/client'

export function useAnalysis(videoId: string) {
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ upload: 0, parse: 0, strategy: 0, prompt: 0 })

  const fetch = async () => {
    try {
      const res = await api.get(`/api/videos/${videoId}`)
      setStatus(res.data.video?.status || '')
      setProgress(res.data.progress || progress)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 3000)
    return () => clearInterval(interval)
  }, [videoId])

  return { status, progress }
}

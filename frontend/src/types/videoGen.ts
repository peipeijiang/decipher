export interface VideoGeneration {
  id: string
  prompt: string
  reference_image: string | null
  model: string
  aspect_ratio: string
  duration: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  video_url: string | null
  video_path: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface VideoGenListResponse {
  items: VideoGeneration[]
  total: number
}

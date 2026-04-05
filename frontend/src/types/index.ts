export interface Video {
  id: string
  filename: string
  filepath: string
  filesize: number
  duration?: number
  platform?: string
  likes?: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

export interface Report {
  id: string
  video_id: string
  strategy?: string
  shots?: string
  prompt?: string
  script?: string
  notes?: string
  created_at: string
}

export interface Progress {
  upload: number
  parse: number
  strategy: number
  prompt: number
}

export interface Segment {
  id: string
  label: string
  startTime: number
  endTime: number
}

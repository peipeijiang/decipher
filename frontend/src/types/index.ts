export interface Video {
  id: string
  filename: string
  filepath: string
  filesize: number
  duration?: number
  platform?: string
  likes?: string
  notes?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string | null
  created_at: string
}

export interface Report {
  id: string
  video_id: string
  strategy?: string
  shots?: string
  prompt?: string
  script?: string
  script_segments?: string  // JSON array of {start, end, text}
  frame_urls?: string[] | null
  notes?: string
  created_at: string
}

export interface Progress {
  upload: number
  parse: number
  strategy: number
  prompt: number
  error?: string | null
}

export interface Segment {
  id: string
  video_id: string
  label: string
  start_time: number
  end_time: number
  analysis?: string | null
  analysis_status?: string | null
  prompt?: string | null
  strategy?: string | null
  shots?: string | null
  created_at?: string
}

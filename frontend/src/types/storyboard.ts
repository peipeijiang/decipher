export interface StoryboardReplication {
  id: string
  video_id: string
  frame_count: number
  frame_timestamps: Array<{ time: number; index: number }>
  storyboard_image_url: string
  layout_grid: string
  status: 'pending' | 'extracting' | 'ready' | 'generating' | 'completed' | 'failed'
  error?: string
  created_at: string
}

export interface StoryboardResult {
  replaced_storyboard: string
  compressed_prompt: string
  original_duration: number
  compressed_duration: number
}

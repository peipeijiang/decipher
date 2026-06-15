export interface Product {
  id: string
  url: string
  title: string
  description: string
  status: 'pending' | 'scraping' | 'analyzing' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
  archive_status: 'active' | 'archived'
  archived_at: string | null
  instruction_board_status?: string
  instruction_board_path?: string | null
}

export interface ProductPrompt {
  id: string
  product_id: string
  template_name: string
  variant_index: number
  prompt_text: string
  image_prompt: string | null
  image_url: string | null
  image_status: 'pending' | 'generating' | 'completed' | 'failed'
  video_url: string | null
  video_status: 'pending' | 'generating' | 'completed' | 'failed'
  grid_layout: 'single' | '2x3' | '3x2'
  width: number | null
  height: number | null
  aspect_ratio: string
  video_style: string
  hook_key: string | null
  video_model: string
  video_duration: number
  batch_id: string | null
  created_at: string
}

export interface ProductProgress {
  scrape: number
  doc: number
  prompts: number
  error: string | null
}

export interface ProductDoc {
  title: string
  description: string
  appearance: string
  usage: string
  selling_points: string
  images: Array<{
    index: number
    filename: string
    basic_recognition: string
    product_understanding: string
    creative_usage: string
  }>
}

export interface VideoTemplate {
  key: string
  name: string
  has_builtin_hook?: boolean
}

export interface AdminUser {
  id: string
  name: string
  email: string
  password_hash: string
  role: 'intern' | 'expert' | 'admin'
  assigned_chapters: number[]
  is_active: boolean
  created_at: string
}

export interface Course {
  id: string
  course_id: string
  level: string
  title: string
  created_at: string
}

export interface Paper {
  id: string
  course_id: string
  paper_number: number
  title: string
  subject: string
  pdf_url: string | null
  total_chapters: number | null
  created_at: string
}

export interface Chapter {
  id: string
  course_id: string
  paper_number: number
  chapter_number: number
  title: string
  start_book_page: number | null
  end_book_page: number | null
  exercise_start_page: number | null
  exercise_end_page: number | null
  status: 'draft' | 'in_progress' | 'verified'
  created_at: string
}

export interface SubChapter {
  id: string
  course_id: string
  paper_number: number
  chapter_number: number
  sub_chapter_id: string
  title: string
  start_book_page: number | null
  end_book_page: number | null
  status: 'draft' | 'in_progress' | 'verified'
  created_at: string
}

export interface ContentPage {
  id: string
  course_id: string
  paper_number: number
  chapter_number: number
  sub_chapter_id: string
  book_page: number
  pdf_page: number
  has_diagram: boolean
  has_table: boolean
  total_concepts: number
  status: 'draft' | 'in_progress' | 'verified'
  created_at: string
}

export interface Concept {
  id: string
  course_id: string
  paper_number: number
  chapter_number: number
  sub_chapter_id: string
  book_page: number
  order_index: number
  concept_title: string | null
  heading: string | null
  content_type: 'text' | 'list' | 'table' | 'definition' | 'image'
  text: string
  /** Public URL for replacement artwork when textbook image could not be OCR’d (optional) */
  image_url?: string | null
  tenglish: string | null
  tenglish_variation_2: string | null
  tenglish_variation_3: string | null
  english: string | null
  english_variation_2: string | null
  english_variation_3: string | null
  is_key_concept: boolean
  kitty_question: string | null
  mama_kitty_answer: string | null
  check_question: string | null
  check_options: string[] | null
  check_answer: number | null
  check_explanation: string | null
  mama_response_correct: string | null
  mama_response_wrong: string | null
  mamas_tip: string | null
  exam_rubric: {
    must_keywords: string[]
    bonus_keywords: string[]
    min_points: number
    format: string
    marks: number
    memory_trick: string
    example_company: string
    common_mistakes: string[]
    model_answer_hints: string[]
  } | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  needs_work: boolean
  rejection_note: string | null
  review_status?: 'draft' | 'submitted' | 'approved' | 'rejected'
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  creator?: AdminUser
}

export interface ReviewLog {
  id: string
  concept_id: string
  reviewed_by: string
  action: 'approved' | 'rejected' | 'edited'
  note: string | null
  created_at: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'intern' | 'expert' | 'admin'
}

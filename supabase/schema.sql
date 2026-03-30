-- Users table (interns + admin)
CREATE TABLE admin_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text DEFAULT 'intern' CHECK (role IN ('intern', 'admin')),
  assigned_chapters jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Course structure
CREATE TABLE courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text UNIQUE NOT NULL, -- 'cma', 'ca'
  level text NOT NULL, -- 'foundation', 'intermediate', 'final'
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Papers
CREATE TABLE papers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text REFERENCES courses(course_id),
  paper_number integer NOT NULL,
  title text NOT NULL,
  subject text NOT NULL, -- 'law', 'acc', 'maths', 'eco'
  pdf_url text,
  total_chapters integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, paper_number)
);

-- Chapters
CREATE TABLE chapters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text NOT NULL,
  paper_number integer NOT NULL,
  chapter_number integer NOT NULL,
  title text NOT NULL,
  start_book_page integer,
  end_book_page integer,
  exercise_start_page integer,
  exercise_end_page integer,
  status text DEFAULT 'draft' 
    CHECK (status IN ('draft','in_progress','verified')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, paper_number, chapter_number)
);

-- Sub-chapters
CREATE TABLE sub_chapters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text NOT NULL,
  paper_number integer NOT NULL,
  chapter_number integer NOT NULL,
  sub_chapter_id text NOT NULL, -- '1.1', '1.2'
  title text NOT NULL,
  start_book_page integer,
  end_book_page integer,
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','verified')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, paper_number, chapter_number, sub_chapter_id)
);

-- Pages
CREATE TABLE content_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text NOT NULL,
  paper_number integer NOT NULL,
  chapter_number integer NOT NULL,
  sub_chapter_id text NOT NULL,
  book_page integer NOT NULL,
  pdf_page integer NOT NULL,
  has_diagram boolean DEFAULT false,
  has_table boolean DEFAULT false,
  total_concepts integer DEFAULT 0,
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','verified')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, paper_number, chapter_number, book_page)
);

-- Concepts (core content unit)
CREATE TABLE concepts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id text NOT NULL,
  paper_number integer NOT NULL,
  chapter_number integer NOT NULL,
  sub_chapter_id text NOT NULL,
  book_page integer NOT NULL,
  order_index integer NOT NULL DEFAULT 1,
  concept_title text,
  heading text,
  content_type text DEFAULT 'text' 
    CHECK (content_type IN ('text','list','table','definition')),
  
  -- Content fields
  text text NOT NULL,
  tenglish text,
  
  -- Kitty interaction
  is_key_concept boolean DEFAULT false,
  kitty_question text,
  mama_kitty_answer text,
  
  -- Check question
  check_question text,
  check_options jsonb,
  check_answer integer CHECK (check_answer BETWEEN 0 AND 3),
  check_explanation text,
  
  -- Mama responses
  mama_response_correct text,
  mama_response_wrong text,
  
  -- Metadata
  is_verified boolean DEFAULT false,
  verified_by uuid REFERENCES admin_users(id),
  verified_at timestamptz,
  needs_work boolean DEFAULT false,
  rejection_note text,
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Review logs
CREATE TABLE review_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id uuid REFERENCES concepts(id),
  reviewed_by uuid REFERENCES admin_users(id),
  action text CHECK (action IN ('approved','rejected','edited')),
  note text,
  created_at timestamptz DEFAULT now()
);

-- Insert seed data
INSERT INTO courses VALUES 
  (gen_random_uuid(), 'cma', 'foundation', 'CMA Foundation');

INSERT INTO papers VALUES
  (gen_random_uuid(), 'cma', 1, 
   'Fundamentals of Business Laws & Communication', 
   'law', 
   'https://rwuntjxogfrqxaphjolj.supabase.co/storage/v1/object/public/textbooks/Paper1_20-06-2024_R_CMA_F.pdf',
   5);

INSERT INTO chapters VALUES
  (gen_random_uuid(), 'cma', 1, 1, 'Introduction to Business Laws', 1, 20, 21, 37, 'in_progress'),
  (gen_random_uuid(), 'cma', 1, 2, 'Indian Contracts Act 1872', 21, 103, 104, 137, 'draft'),
  (gen_random_uuid(), 'cma', 1, 3, 'Sale of Goods Act 1930', 104, 160, 161, 177, 'draft'),
  (gen_random_uuid(), 'cma', 1, 4, 'Negotiable Instruments Act 1881', 161, 198, 199, 208, 'draft'),
  (gen_random_uuid(), 'cma', 1, 5, 'Business Communication', 199, 272, 273, 288, 'draft');

INSERT INTO sub_chapters VALUES
  (gen_random_uuid(), 'cma', 1, 1, '1.1', 'Sources of Law', 3, 7, 'draft'),
  (gen_random_uuid(), 'cma', 1, 1, '1.2', 'Legislative Process in India', 8, 12, 'draft'),
  (gen_random_uuid(), 'cma', 1, 1, '1.3', 'Legal Method and Court System in India', 13, 17, 'draft'),
  (gen_random_uuid(), 'cma', 1, 1, '1.4', 'Primary and Subordinate Legislation', 18, 20, 'draft');

-- Insert default admin user (password: admin123)
INSERT INTO admin_users (name, email, password_hash, role) VALUES
  ('Sai Kumar', 'sai@somi.app', 
   'admin123',
   'admin');

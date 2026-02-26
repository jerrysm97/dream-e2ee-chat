-- ============================================================
-- Migration: 003_posts_and_display_name
-- Adds display_name to profiles, creates posts table for feed
-- ============================================================

-- Add display_name to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Create posts table for news feed
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;

-- All authenticated users can read posts
CREATE POLICY "posts_select_authenticated"
    ON public.posts FOR SELECT TO authenticated USING (true);

-- Users can insert their own posts
CREATE POLICY "posts_insert_own"
    ON public.posts FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id);

-- Users can delete their own posts
CREATE POLICY "posts_delete_own"
    ON public.posts FOR DELETE TO authenticated
    USING (auth.uid() = author_id);

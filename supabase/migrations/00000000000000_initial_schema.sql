-- ==========================================
-- 1. PROFILES TABLE
-- ==========================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE,
    public_key TEXT, -- Removed NOT NULL temporarily to allow auto-creation on signup
    avatar_url TEXT
);

-- Enable and Force RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to all authenticated users"
    ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to update ONLY their own profile"
    ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- The Trigger: Automatically create a profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ==========================================
-- 2. MESSAGE QUEUE TABLE
-- ==========================================
CREATE TABLE public.message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- Trap 2 Fixed
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,    -- Trap 2 Fixed
    cipher_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Explicitly index recipient_id for fast application startup lookups
CREATE INDEX idx_message_queue_recipient_id ON public.message_queue(recipient_id);

-- Enable and Force RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to INSERT messages"
    ON public.message_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Allow users to SELECT ONLY where auth.uid() = recipient_id"
    ON public.message_queue FOR SELECT TO authenticated USING (auth.uid() = recipient_id);

CREATE POLICY "Allow users to DELETE ONLY where auth.uid() = recipient_id"
    ON public.message_queue FOR DELETE TO authenticated USING (auth.uid() = recipient_id);

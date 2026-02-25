-- ============================================================
-- DREAM APP — FULL SETUP SCRIPT
-- Paste this entire block into Supabase Dashboard → SQL Editor → Run
-- https://supabase.com/dashboard/project/wscpkkylptbpcppdfuhc/sql
-- ============================================================


-- ══════════════════════════════════════════════════════
-- MIGRATION 1: Schema (profiles + message_queue)
-- ══════════════════════════════════════════════════════

-- 1a. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE,
    public_key  TEXT,   -- Curve25519 public key (Base64). Uploaded on first login.
    avatar_url  TEXT
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated"
    ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 1b. Message queue table (ephemeral — messages deleted after client delivery)
CREATE TABLE IF NOT EXISTS public.message_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cipher_text  TEXT NOT NULL,         -- Nonce-prepended Base64 nacl.box output
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_queue_recipient_id
    ON public.message_queue(recipient_id);

ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "msgq_insert_as_sender"
    ON public.message_queue FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "msgq_select_as_recipient"
    ON public.message_queue FOR SELECT TO authenticated
    USING (auth.uid() = recipient_id);

CREATE POLICY "msgq_delete_as_recipient"
    ON public.message_queue FOR DELETE TO authenticated
    USING (auth.uid() = recipient_id);


-- ══════════════════════════════════════════════════════
-- MIGRATION 2: Garbage collector (pg_cron)
-- ══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- Remove existing job first so re-running is safe
SELECT cron.unschedule('sweep_stale_messages')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_messages'
);

-- Schedule: midnight UTC daily — purges messages older than 30 days
SELECT cron.schedule(
    'sweep_stale_messages',
    '0 0 * * *',
    $$
        DELETE FROM public.message_queue
        WHERE created_at < NOW() - INTERVAL '30 days';
    $$
);


-- ============================================================
-- Migration: 00000000000002_user_tags
-- Unique short human-readable ID (e.g. #AB3X7K) auto-assigned
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_tag TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_tag_unique ON public.profiles (user_tag);

CREATE OR REPLACE FUNCTION public.generate_user_tag()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_tag TEXT;
  attempt INT := 0;
BEGIN
  LOOP
    new_tag := '#';
    FOR i IN 1..6 LOOP
      new_tag := new_tag || substr(chars, (floor(random() * 32) + 1)::INT, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_tag = new_tag) THEN
      RETURN new_tag;
    END IF;
    attempt := attempt + 1;
    IF attempt > 200 THEN
      RAISE EXCEPTION 'Could not generate unique user_tag after 200 attempts';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_user_tag()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_tag IS NULL OR NEW.user_tag = '' THEN
    NEW.user_tag := public.generate_user_tag();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_user_tag ON public.profiles;
CREATE TRIGGER trg_auto_user_tag
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_user_tag();

UPDATE public.profiles SET user_tag = public.generate_user_tag() WHERE user_tag IS NULL;
ALTER TABLE public.profiles ALTER COLUMN user_tag SET NOT NULL;


-- ══════════════════════════════════════════════════════
-- VERIFICATION — Run these separately to confirm setup
-- ══════════════════════════════════════════════════════
-- SELECT * FROM public.profiles LIMIT 5;
-- SELECT * FROM public.message_queue LIMIT 5;
-- SELECT * FROM cron.job WHERE jobname = 'sweep_stale_messages';

-- ============================================================
-- Migration: user_tag — unique short human-readable ID
-- Each user gets a tag like #AB3X7K auto-assigned on signup
-- ============================================================

-- 1. Add column (nullable first so existing rows don't fail)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_tag TEXT;

-- 2. Unique index
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_tag_unique
  ON public.profiles (user_tag);

-- 3. Tag generator function
--    Uses characters that are easy to read/type (no 0/O/1/I confusion)
CREATE OR REPLACE FUNCTION public.generate_user_tag()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_tag TEXT;
  attempt  INT := 0;
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

-- 4. Trigger: auto-assign tag on INSERT if not provided
CREATE OR REPLACE FUNCTION public.auto_assign_user_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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

-- 5. Backfill existing profiles that have no tag
UPDATE public.profiles
SET    user_tag = public.generate_user_tag()
WHERE  user_tag IS NULL;

-- 6. Now make it NOT NULL
ALTER TABLE public.profiles
  ALTER COLUMN user_tag SET NOT NULL;

-- 7. Allow public read of user_tag so search works
-- (profiles already selected by authenticated users via RLS — just ensure select includes user_tag)
-- No extra policy needed; existing SELECT policy covers all columns.

-- Done. Verify:
-- SELECT id, user_tag FROM public.profiles LIMIT 10;

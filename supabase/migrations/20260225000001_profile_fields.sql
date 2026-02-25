-- Migration: Add Profile Customization Fields
-- Description: Adds display_name to the profiles table.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update the handle_new_user function to also accept display_name and avatar_url if provided in raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

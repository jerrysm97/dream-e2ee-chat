-- Phase 10: Security and Performance Lockdown
-- 1. Payload Validation
-- Ensure cipher_text is not abused to store massive files in the database.
-- 100,000 chars is roughly 100KB, plenty for a text message.
ALTER TABLE public.message_queue
ADD CONSTRAINT cipher_text_length_check CHECK (length(cipher_text) <= 100000);

-- 2. Rate Limiting Function
-- Prevent users from spamming the message_queue and filling up storage.
-- Limit: 30 messages per minute per sender_id.

CREATE OR REPLACE FUNCTION public.check_message_rate_limit()
RETURNS trigger AS $$
DECLARE
    message_count integer;
BEGIN
    SELECT count(*)
    INTO message_count
    FROM public.message_queue
    WHERE sender_id = NEW.sender_id
      AND created_at >= NOW() - INTERVAL '1 minute';

    IF message_count >= 30 THEN
        RAISE EXCEPTION 'Rate limit exceeded. Maximum 30 messages per minute allowed.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Rate Limiting Trigger
-- Bind the function to the message_queue table BEFORE INSERT.
DROP TRIGGER IF EXISTS restrict_message_rate ON public.message_queue;

CREATE TRIGGER restrict_message_rate
BEFORE INSERT ON public.message_queue
FOR EACH ROW
EXECUTE FUNCTION public.check_message_rate_limit();

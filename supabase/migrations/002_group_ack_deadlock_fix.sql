-- Drop old trigger function
DROP FUNCTION IF EXISTS cleanup_group_message CASCADE;

-- New trigger with 7-day fallback
CREATE OR REPLACE FUNCTION cleanup_group_message()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM message_queue
  WHERE id = NEW.message_id
    AND (
      -- All members acknowledged
      (SELECT COUNT(*) FROM message_acks WHERE message_id = NEW.message_id)
        >= (SELECT member_count FROM group_channels WHERE id = NEW.group_id)
      OR
      -- Stale message fallback: 7-day auto-purge regardless of missing ACKs
      created_at < NOW() - INTERVAL '7 days'
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER after_ack_insert
  AFTER INSERT ON message_acks
  FOR EACH ROW EXECUTE FUNCTION cleanup_group_message();

-- Update existing cron to 7 days
SELECT cron.schedule(
    'sweep_stale_messages',
    '0 0 * * *',
    $$
        DELETE FROM public.message_queue
        WHERE created_at < NOW() - INTERVAL '7 days';
    $$
);

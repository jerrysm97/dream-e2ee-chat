-- ==========================================
-- GARBAGE COLLECTOR: Stale Message Sweep
-- ==========================================
-- Protects the Supabase 500MB free tier by automatically purging
-- message_queue rows that were never fetched (offline user > 30 days,
-- or app uninstalled before message delivery).
--
-- Runs via pg_cron at midnight UTC every day.
-- Safe to run repeatedly: cron.schedule() is idempotent by job name.
-- ==========================================

-- Step 1: Enable pg_cron extension
-- (Included in all Supabase projects. Safe to call if already enabled.)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Grant cron schema usage to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Step 3: Register the daily sweep job.
-- If a job with this name already exists, Supabase will update it.
SELECT cron.schedule(
    'sweep_stale_messages',          -- Unique job name
    '0 0 * * *',                     -- Schedule: 00:00 UTC daily
    $$
        DELETE FROM public.message_queue
        WHERE created_at < NOW() - INTERVAL '30 days';
    $$
);

-- ── Verification queries (run after applying to confirm) ──────────────────────
-- Check the job is registered:
--   SELECT * FROM cron.job WHERE jobname = 'sweep_stale_messages';
--
-- Check job run history:
--   SELECT * FROM cron.job_run_details WHERE jobid = (
--     SELECT jobid FROM cron.job WHERE jobname = 'sweep_stale_messages'
--   ) ORDER BY start_time DESC LIMIT 10;
--
-- To unschedule the job if needed:
--   SELECT cron.unschedule('sweep_stale_messages');

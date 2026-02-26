-- 20260225000002_group_chats.sql
-- Group Chat Infrastructure for E2EE messaging

-- 1. Create Groups table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Group Members table
-- encrypted_group_key: the group's shared secret key, encrypted for EACH specific user using their individual public key.
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    encrypted_group_key TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- 3. Update message_queue for Group Support
ALTER TABLE public.message_queue 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;

-- Update recipient_id indexing and constraints
ALTER TABLE public.message_queue 
ALTER COLUMN recipient_id DROP NOT NULL;

-- 4. Create Message ACKs table (for trigger-based deletion)
CREATE TABLE IF NOT EXISTS public.message_acks (
    message_id UUID REFERENCES public.message_queue(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ack_type TEXT DEFAULT 'READ',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

-- 5. RLS SECURITY POLICIES

-- Groups RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view groups they belong to"
ON public.groups FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = public.groups.id 
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Anyone can create groups"
ON public.groups FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Group Members RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own membership"
ON public.group_members FOR SELECT
USING (user_id = auth.uid());

-- Message Queue RLS Update
DROP POLICY IF EXISTS "Recipient can view their messages" ON public.message_queue;
CREATE POLICY "Recipient or group member can view messages"
ON public.message_queue FOR SELECT
USING (
    auth.uid() = recipient_id OR 
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = public.message_queue.group_id 
        AND user_id = auth.uid()
    )
);

-- 6. TRIGGER LOGIC: Auto-delete group messages when read by all members

CREATE OR REPLACE FUNCTION public.cleanup_group_message()
RETURNS TRIGGER AS $$
DECLARE
    member_count INT;
    ack_count INT;
BEGIN
    -- Only act if it's a group message
    IF (SELECT group_id FROM public.message_queue WHERE id = NEW.message_id) IS NOT NULL THEN
        -- Get total group members
        SELECT COUNT(*) INTO member_count 
        FROM public.group_members 
        WHERE group_id = (SELECT group_id FROM public.message_queue WHERE id = NEW.message_id);

        -- Get total ACKs for this message
        SELECT COUNT(*) INTO ack_count 
        FROM public.message_acks 
        WHERE message_id = NEW.message_id;

        -- If everyone has read it, purge the queue
        IF ack_count >= member_count THEN
            DELETE FROM public.message_queue WHERE id = NEW.message_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_cleanup_group_message
AFTER INSERT ON public.message_acks
FOR EACH ROW EXECUTE FUNCTION public.cleanup_group_message();

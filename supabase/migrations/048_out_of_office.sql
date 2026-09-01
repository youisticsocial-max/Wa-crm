-- Add a cooldown tracker to conversations to prevent OOO spam
ALTER TABLE conversations
ADD COLUMN last_ooo_sent_at TIMESTAMP WITH TIME ZONE;

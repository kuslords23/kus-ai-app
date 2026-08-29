-- Add raw token column for permanent PAT storage.
-- The previous migration only stored hashed tokens; we need the raw
-- token so it can be returned for API calls across sessions.

alter table github_pat_tokens add column if not exists token text;
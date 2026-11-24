-- DrivMatch Stream account lifecycle audit (Cloudflare D1).
-- Non-destructive additions. Existing user identities, sessions and favorites are preserved.
-- All event timestamps are UTC Unix seconds; display is converted to America/Sao_Paulo.
ALTER TABLE stream_users ADD COLUMN activated_at INTEGER;
ALTER TABLE stream_users ADD COLUMN first_login_at INTEGER;
ALTER TABLE stream_users ADD COLUMN last_login_at INTEGER;
ALTER TABLE stream_users ADD COLUMN canceled_invite_at INTEGER;
-- Pre-existing activity cannot be reconstructed reliably; NULL means not recorded.

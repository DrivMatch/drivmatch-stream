-- DrivMatch Stream: isolated identities and user data (Cloudflare D1).
-- No public signup. Identities are issued by a dedicated Supabase Auth project.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS stream_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','viewer')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS stream_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES stream_users(user_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_stream_sessions_user ON stream_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_stream_sessions_expiry ON stream_sessions(expires_at);
CREATE TABLE IF NOT EXISTS stream_favorites (
  user_id TEXT NOT NULL REFERENCES stream_users(user_id) ON DELETE CASCADE,
  favorite_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, favorite_key)
);
-- Do not store viewing history, last-watched channel, or stream URLs.
CREATE TABLE IF NOT EXISTS stream_admin_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL REFERENCES stream_users(user_id),
  action TEXT NOT NULL,
  subject_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_stream_admin_events_time ON stream_admin_events(created_at);
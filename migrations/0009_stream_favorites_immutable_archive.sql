-- STREAM NOW / FAVORITES INCIDENT MITIGATION / ADDITIVE ONLY
-- Never drop, truncate or rewrite stream_favorites.
-- Capture all preexisting favorites before installing protective triggers.
CREATE TABLE IF NOT EXISTS stream_favorites_archive (
  user_id TEXT NOT NULL,
  favorite_key TEXT NOT NULL,
  first_archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  source TEXT NOT NULL DEFAULT 'existing-or-new',
  PRIMARY KEY (user_id, favorite_key)
);
INSERT OR IGNORE INTO stream_favorites_archive(user_id,favorite_key,source)
SELECT user_id,favorite_key,'baseline-before-freeze'
FROM stream_favorites;
CREATE TRIGGER IF NOT EXISTS stream_favorites_immutable_insert_archive
AFTER INSERT ON stream_favorites
BEGIN
  INSERT OR IGNORE INTO stream_favorites_archive(user_id,favorite_key,source)
  VALUES(NEW.user_id, NEW.favorite_key, 'account-add');
END;
-- Emergency lock at the database layer. Even an old Worker deployment cannot
-- silently delete a favorite or cascade-remove its source row. A later explicit
-- and independently reviewed removal protocol must reconcile the archive.
CREATE TRIGGER IF NOT EXISTS stream_favorites_emergency_no_delete
BEFORE DELETE ON stream_favorites
BEGIN
  SELECT RAISE(ABORT,'FAVORITES_EMERGENCY_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS stream_favorites_emergency_no_update
BEFORE UPDATE ON stream_favorites
BEGIN
  SELECT RAISE(ABORT,'FAVORITES_EMERGENCY_IMMUTABLE');
END;

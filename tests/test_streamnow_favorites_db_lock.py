"""Real SQLite/D1-compatible emergency favorites archive invariants."""
import pathlib
import sqlite3
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class FavoritesAccountArchiveTests(unittest.TestCase):
 def test_preexisting_favorites_are_archived_and_database_deletes_blocked(self):
  db=sqlite3.connect(":memory:")
  db.execute("PRAGMA foreign_keys=ON")
  db.executescript((ROOT/"migrations/0001_stream_identities.sql").read_text())
  db.execute("INSERT INTO stream_users(user_id,email,role,status) VALUES('viewer-1','viewer@example.test','viewer','active')")
  db.execute("INSERT INTO stream_favorites(user_id,favorite_key) VALUES('viewer-1','lista-2:BR:channel-a')")
  db.commit()
  db.executescript((ROOT/"migrations/0009_stream_favorites_immutable_archive.sql").read_text())
  self.assertEqual(db.execute("SELECT COUNT(*) FROM stream_favorites_archive").fetchone()[0],1)
  db.execute("INSERT INTO stream_favorites(user_id,favorite_key) VALUES('viewer-1','lista-2:BR:channel-b')")
  self.assertEqual(db.execute("SELECT COUNT(*) FROM stream_favorites_archive").fetchone()[0],2)
  with self.assertRaises(sqlite3.DatabaseError):
   db.execute("DELETE FROM stream_favorites WHERE user_id='viewer-1'")
  with self.assertRaises(sqlite3.DatabaseError):
   db.execute("UPDATE stream_favorites SET favorite_key='bad' WHERE user_id='viewer-1'")
  self.assertEqual(db.execute("SELECT COUNT(*) FROM stream_favorites WHERE user_id='viewer-1'").fetchone()[0],2)
  self.assertEqual(db.execute("SELECT COUNT(*) FROM stream_favorites_archive WHERE user_id='viewer-1'").fetchone()[0],2)
  db.close()

if __name__=="__main__":unittest.main()

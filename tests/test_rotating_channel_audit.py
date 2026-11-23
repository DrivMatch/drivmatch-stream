"""Unit checks for DrivMatch rotating queue and 50-day cleanup."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("stream_rotation", ROOT / "scripts" / "daily_channel_autopilot.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

PLAYLIST = '#EXTM3U\n#EXTINF:-1 tvg-country="BR",Canal Um\nhttps://media.example.org/one.m3u8\n'

class RotationTests(unittest.TestCase):
    def test_reservation_and_cursor_advance(self):
        candidates = {str(i).zfill(5): {"id":str(i).zfill(5)} for i in range(6860)}
        previous = {k: {"status":"ok"} for k in candidates}
        for k in sorted(candidates)[:500]:
            previous.pop(k)
        first, cursor, priority = module.select_rotating(candidates, previous)
        self.assertEqual(len(first), 2000)
        self.assertEqual(priority, 300)
        self.assertEqual(len({x["id"] for x in first}), 2000)
        for x in first:
            previous[x["id"]] = {"status":"ok"}
        second, next_cursor, new_priority = module.select_rotating(candidates, previous, cursor)
        self.assertEqual(len(second), 2000)
        self.assertEqual(new_priority, 200)
        self.assertNotEqual(cursor, next_cursor)

    def test_success_resets_failure_window_and_deletion_requires_50_days(self):
        src = ("curated", "https://source.example.org/feed.m3u8", "", "", True)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with mock.patch.multiple(module, ROTATING_AUDIT=True, SOURCES=(src,),
                                     STATE=root/"state.json", OUTPUT=root/"channels.m3u8",
                                     REPORT=root/"report.json"), \
                 mock.patch.object(module, "research_pages", return_value={}):
                for day, good in [(0, False), (49, False), (50, False)]:
                    now=dt.datetime(2026,1,1,tzinfo=dt.timezone.utc)+dt.timedelta(days=day)
                    result=module.run(now=now, fetch=lambda u,n: PLAYLIST.encode(),
                                      probe=lambda item: (item["id"],good))
                self.assertEqual(result["deleted_after_50_days"], 1)
                state=json.loads((root/"state.json").read_text())
                self.assertEqual(len(state["channels"]),0)
                self.assertEqual(len(state["deleted_ids"]),1)
                result=module.run(now=dt.datetime(2026,3,1,tzinfo=dt.timezone.utc),
                                  fetch=lambda u,n: PLAYLIST.encode(),
                                  probe=lambda item: (item["id"],True))
                self.assertEqual(result["curated_candidates"],0)
                self.assertEqual(len(json.loads((root/"state.json").read_text())["deleted_ids"]),1)

    def test_recovery_clears_failure_clock(self):
        src = ("curated", "https://source.example.org/feed.m3u8", "", "", True)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with mock.patch.multiple(module, ROTATING_AUDIT=True, SOURCES=(src,),
                                     STATE=root/"state.json", OUTPUT=root/"channels.m3u8",
                                     REPORT=root/"report.json"), \
                 mock.patch.object(module, "research_pages", return_value={}):
                for day, good in [(0,False),(30,True),(51,False)]:
                    now=dt.datetime(2026,1,1,tzinfo=dt.timezone.utc)+dt.timedelta(days=day)
                    result=module.run(now=now, fetch=lambda u,n: PLAYLIST.encode(),
                                      probe=lambda item: (item["id"],good))
                self.assertEqual(result["deleted_after_50_days"],0)
                self.assertEqual(len(json.loads((root/"state.json").read_text())["channels"]),1)

if __name__ == "__main__":
    unittest.main()

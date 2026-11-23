"""Regression checks for nightly curated-source full audit; not a Samsung playback test."""
import datetime as dt
import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("daily_autopilot_nightly", ROOT / "scripts" / "daily_channel_autopilot.py")
autopilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(autopilot)

SAMPLE = '#EXTM3U\n#EXTINF:-1 tvg-country="BR",Canal Aberto\nhttps://media.example.org/one.m3u8\n#EXTINF:-1 tvg-country="PT",Canal Dois\nhttps://media.example.org/two.m3u8\n'

class NightlyAuditTests(unittest.TestCase):
    def test_full_selection_includes_failed_and_new_without_sampling(self):
        items = {str(i): {"id": str(i), "country": "BR", "genre": "news"} for i in range(250)}
        previous = {"0": {"status": "failed", "checked": "2026-11-22"}}
        with mock.patch.object(autopilot, "FULL_AUDIT", True):
            chosen = autopilot.select_for_check(items, previous, dt.datetime(2026,11,23,tzinfo=dt.timezone.utc))
        self.assertEqual(len(chosen), 250)
        self.assertEqual({x["id"] for x in chosen}, set(items))

    def test_full_audit_rejects_missing_source_without_changing_catalog(self):
        sources = (
            ("good", "https://source.example.org/good.m3u8", "", "", True),
            ("unavailable", "https://source.example.org/bad.m3u8", "", "", True),
        )
        with tempfile.TemporaryDirectory() as folder:
            p=pathlib.Path(folder)
            output=p/"auto.m3u8"
            output.write_text("existing")
            def fetch(url, cap):
                if url.endswith("bad.m3u8"):
                    raise OSError("outage")
                return SAMPLE.encode()
            with mock.patch.multiple(autopilot, FULL_AUDIT=True, SOURCES=sources,
                                     STATE=p/"state.json", OUTPUT=output, REPORT=p/"report.json"):
                with self.assertRaisesRegex(RuntimeError, "refusing to publish partial coverage"):
                    autopilot.run(dt.datetime(2026,11,23,tzinfo=dt.timezone.utc),
                                  fetch=fetch, probe=lambda item:(item["id"],True))
            self.assertEqual(output.read_text(), "existing")

    def test_full_audit_marks_only_curated_scope_not_whole_stream(self):
        sources = (("curated", "https://source.example.org/good.m3u8", "", "", True),)
        with tempfile.TemporaryDirectory() as folder:
            p=pathlib.Path(folder)
            with mock.patch.multiple(autopilot, FULL_AUDIT=True, SOURCES=sources,
                                     STATE=p/"state.json", OUTPUT=p/"auto.m3u8", REPORT=p/"report.json"), \
                 mock.patch.object(autopilot, "research_pages", return_value={}):
                result=autopilot.run(dt.datetime(2026,11,23,tzinfo=dt.timezone.utc),
                                     fetch=lambda url, cap:SAMPLE.encode(),
                                     probe=lambda item:(item["id"],True))
            self.assertEqual(result["state"],"COMPLETED")
            self.assertEqual(result["tested"],result["curated_candidates"])
            self.assertTrue(result["full_audit_of_curated_candidates"])
            self.assertFalse(result["total_catalog_coverage_confirmed"])

if __name__ == "__main__":
    unittest.main()

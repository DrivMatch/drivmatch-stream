import datetime as dt
import unittest
from zoneinfo import ZoneInfo
from scripts.streamnow_autopilot_audit import audit_a, audit_b, runs_for_day

NOW=dt.datetime(2026,11,25,9,3,tzinfo=dt.timezone.utc)
GOOD={"event":"schedule","status":"completed","conclusion":"success",
      "created_at":"2026-11-25T05:02:00Z"}
REPORT={"schema":1,"date_utc":"2026-11-25","state":"COMPLETED","tested":120,
        "tested_ok":80,"tested_failed":40,"published_healthy":350,"sources_responded":28}
RESEARCH={"date_utc":"2026-11-25","countries_scanned":8,
          "multilingual_searches":[{"provider":"github:pt","status":"OK"}]}
PLAYLIST="#EXTM3U\n#EXTINF:-1,Channel\nhttps://example.org/live.m3u8\n"

class AuditAgentsTests(unittest.TestCase):
    def test_04_passes_completed_2am_and_current_report(self):
        self.assertEqual(audit_a([GOOD],REPORT,NOW),[])
    def test_04_detects_missed_2am(self):
        self.assertIn("no-successful-scan-since-02:00",audit_a([],REPORT,NOW))
    def test_06_uses_separate_checks_and_detects_stale_research(self):
        self.assertEqual(audit_b([GOOD],REPORT,RESEARCH,PLAYLIST,NOW),[])
        self.assertIn("worldwide-research-report-stale",
            audit_b([GOOD],REPORT,{**RESEARCH,"date_utc":"2026-11-24"},PLAYLIST,NOW))
    def test_06_detects_inconsistent_counts_and_empty_catalog(self):
        self.assertIn("published-playlist-invalid",
            audit_b([GOOD],REPORT,RESEARCH,"",NOW))
        self.assertIn("catalog-test-totals-inconsistent",
            audit_b([GOOD],{**REPORT,"tested_failed":8},RESEARCH,PLAYLIST,NOW))
    def test_old_run_not_used_as_success_for_today(self):
        run={**GOOD,"created_at":"2026-11-24T05:10:00Z"}
        self.assertFalse(runs_for_day([run],NOW))
    def test_repair_does_not_erase_favorites(self):
        from pathlib import Path
        p=Path(__file__).resolve().parents[1]
        source=(p/"scripts/streamnow_autopilot_audit.py").read_text()
        self.assertNotIn("localStorage.clear",source)
        self.assertNotIn("localStorage.removeItem",source)
if __name__ == "__main__":
    unittest.main()

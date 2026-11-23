"""Unit tests for daily discovery; no live broadcaster and no secret needed."""
import datetime as dt
import importlib.util
import json
import pathlib
import socket
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("daily_autopilot", ROOT / "scripts" / "daily_channel_autopilot.py")
autopilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(autopilot)

SAMPLE = """#EXTM3U
#EXTINF:-1 tvg-id="RecordNews.br@HD" tvg-country="BR" tvg-language="Portuguese" group-title="News",Record News
https://stream.example.org/record.m3u8
#EXTINF:-1 tvg-country="PT" group-title="Sports",DAZN 1
https://stream.example.org/paid.m3u8
#EXTINF:-1 tvg-country="PT" group-title="Sports",Canal Esporte Público
https://stream.example.org/sport.m3u8
#EXTINF:-1 tvg-country="US" group-title="Movies" tvg-language="English",Cine Livre
https://stream.example.org/cine.m3u8
#EXTINF:-1 tvg-country="BR",Unsafe local channel
http://127.0.0.1/private.m3u8
#EXTINF:-1 tvg-country="BR",Secret token
https://stream.example.org/secret.m3u8?token=hidden
"""

class AutopilotTests(unittest.TestCase):
    def test_parse_country_language_genre_and_exclude_paid(self):
        feed = ("open", "https://source.example.org/feed.m3u8", "", "", True)
        found = autopilot.parse_playlist(SAMPLE, feed)
        self.assertEqual(len(found), 3)
        self.assertEqual(found[0]["country"], "BR")
        self.assertEqual(found[0]["genre"], "news")
        self.assertEqual(found[0]["language"], "pt")
        self.assertEqual(found[1]["country"], "PT")
        self.assertEqual(found[1]["genre"], "sports")
        self.assertEqual(found[2]["country"], "US")
        self.assertEqual(found[2]["genre"], "movies")
        self.assertTrue(all(x["url"].startswith("https:") for x in found))
        self.assertNotIn("DAZN", json.dumps(found))

    def test_unknown_country_kept_other_no_language_guess(self):
        feed = ("open", "https://source.example.org/feed.m3u8", "", "", True)
        found = autopilot.parse_playlist(
            '#EXTM3U\n#EXTINF:-1 group-title="Movies",Cinema desconhecido\n'
            'https://stream.example.org/a.m3u8\n', feed)
        self.assertEqual(found[0]["country"], "OTHER")
        self.assertEqual(found[0]["language"], "")
        self.assertEqual(found[0]["genre"], "movies")

    def test_stream_urls_cannot_contain_tokens_or_local_addresses(self):
        for url in ("http://example.com/v.m3u8", "https://127.0.0.1/v.m3u8",
                    "https://localhost/a.m3u8", "https://abc.example.org:3000/a.m3u8",
                    "https://example.org/a.m3u8?token=abc", "https://example.org:abc/a.m3u8"):
            self.assertFalse(autopilot.safe_url(url, check_dns=False) if "127.0.0.1" not in url else
                             autopilot.safe_url(url, check_dns=True), url)

    def test_probe_checks_real_segment_not_only_manifest(self):
        manifest = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nnext.ts\n'
        bytes_by_url = {
            'https://media.example.org/live.m3u8': manifest.encode(),
            'https://media.example.org/next.ts': b'\x47' + b'\x00' * 500,
        }
        def getter(url, limit, deadline=None, segment=False):
            return bytes_by_url[url]
        with mock.patch.object(autopilot, "safe_url", return_value=True):
            self.assertTrue(autopilot.probe_once("https://media.example.org/live.m3u8", 100, getter))
            bytes_by_url['https://media.example.org/next.ts'] = b'<html>Login required</html>' + b'x' * 250
            self.assertFalse(autopilot.probe_once("https://media.example.org/live.m3u8", 100, getter))

    def test_explicit_encrypted_hls_does_not_get_auto_promoted(self):
        manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:10,\nvideo.ts\n'
        with mock.patch.object(autopilot, "safe_url", return_value=True):
            self.assertFalse(autopilot.probe_once(
                "https://media.example.org/live.m3u8", 100,
                lambda url, limit, deadline=None, segment=False: manifest.encode()))

    def test_failed_probe_waits_full_minute_without_real_delay(self):
        clock = [100.0]
        def advance(seconds): clock[0] += seconds
        with mock.patch.object(autopilot.time, "monotonic", side_effect=lambda: clock[0]), \
             mock.patch.object(autopilot.time, "sleep", side_effect=advance), \
             mock.patch.object(autopilot, "probe_once", return_value=False):
            key, good = autopilot.check_channel({"id": "a", "url": "https://media.example.org/a.m3u8"})
        self.assertEqual(key, "a")
        self.assertFalse(good)
        self.assertGreaterEqual(clock[0] - 100, 60.0)

    def test_failed_channels_cannot_starve_new_discovery(self):
        now = dt.datetime(2026, 11, 23, tzinfo=dt.timezone.utc)
        candidates = {}
        previous = {}
        for i in range(250):
            key = f"failed-{i}"
            candidates[key] = {"id": key, "name": f"Failed {i}", "country": "BR", "genre": "news"}
            previous[key] = {"status": "failed", "checked": "2026-11-22"}
        for i in range(250):
            key = f"new-{i}"
            candidates[key] = {"id": key, "name": f"New {i}", "country": "PT", "genre": "sports"}
        selected = autopilot.select_for_check(candidates, previous, now)
        self.assertEqual(len(selected), autopilot.MAX_CHECKS)
        self.assertGreaterEqual(sum(x["id"].startswith("new-") for x in selected),
                                autopilot.MAX_CHECKS // 2)
        self.assertGreaterEqual(sum(x["id"].startswith("failed-") for x in selected), 1)

    def test_daily_run_only_publishes_eligible_and_verified(self):
        feed = ("source", "https://source.example.org/free.m3u8", "", "", True)
        research = ("research", "https://source.example.org/unknown.m3u8", "", "", False)
        with tempfile.TemporaryDirectory() as td:
            p = pathlib.Path(td)
            with mock.patch.multiple(autopilot, STATE=p / "state.json", OUTPUT=p / "auto.m3u8",
                                     REPORT=p / "report.json", SOURCES=(feed, research)), \
                 mock.patch.object(autopilot.socket, "getaddrinfo",
                     return_value=[(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("8.8.8.8",443))]), \
                 mock.patch.object(autopilot, "research_pages",
                     return_value={"pages_attempted":7,"pages_responded":0,"pages_unavailable":["mocked"]}):
                result = autopilot.run(dt.datetime(2026, 11, 23, tzinfo=dt.timezone.utc),
                    fetch=lambda url, cap: SAMPLE.encode(),
                    probe=lambda item: (item["id"], item["name"] != "Cine Livre"))
                playlist = (p / "auto.m3u8").read_text()
                report = json.loads((p / "report.json").read_text())
                state = json.loads((p / "state.json").read_text())
        self.assertEqual(result["sources_responded"], 2)
        self.assertEqual(result["community_candidates_research_only"], 3)
        self.assertEqual(report["tested"], 3)
        self.assertEqual(report["published_healthy"], 2)
        self.assertIn('tvg-country="BR"', playlist)
        self.assertIn('tvg-country="PT"', playlist)
        self.assertNotIn("DAZN", playlist)
        self.assertNotIn("Cine Livre", playlist)
        self.assertEqual(len(state["channels"]), 3)


    def test_cyrillic_display_name_and_original_are_preserved_in_vetted_m3u(self):
        item = {
            "name": "Россия 24", "country": "RU", "language": "ru",
            "genre": "news", "checked": "2026-11-23",
            "original_name": "Россия 24",
            "display_name_pt": "Rossiya 24 — Notícias da Rússia",
            "aliases": ["Россия 24", "Rossiya 24"]
        }
        value = autopilot.as_extinf(item)
        self.assertIn('dm-original-name="Россия 24"', value)
        self.assertIn('dm-aliases="Россия 24 | Rossiya 24"', value)
        self.assertIn(",Rossiya 24 — Notícias da Rússia", value)

    def test_daily_sampler_records_name_profile_without_claiming_official_name(self):
        profile = autopilot.describe_channel("Россия 24", "RU")
        self.assertEqual(profile["original_name"], "Россия 24")
        self.assertEqual(profile["official_name"], "")
        self.assertIn("Rossiya 24", profile["aliases"])

if __name__ == "__main__":
    unittest.main()

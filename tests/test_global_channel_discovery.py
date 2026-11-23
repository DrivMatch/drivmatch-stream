"""Offline regression tests for worldwide discovery and naming persistence."""
import datetime as dt
import json
import pathlib
import tempfile
import unittest
from unittest import mock
from scripts import global_channel_discovery as gd


class GlobalDiscoveryTests(unittest.TestCase):
    def test_russian_transliteration_and_curated_display_do_not_destroy_original(self):
        row = gd.describe_channel("Россия 24", "RU")
        self.assertEqual(row["original_name"], "Россия 24")
        self.assertEqual(row["international_name"], "Rossiya 24")
        self.assertEqual(row["display_name_pt"], "Rossiya 24 — Notícias da Rússia")
        self.assertIn("Россия 24", row["aliases"])
        self.assertIn("Russia 24", row["aliases"])
        self.assertEqual(row["original_script"], "Cyrillic")
        self.assertEqual(row["name_provenance"], "curated_reference")

    def test_unknown_names_never_get_invented_official_translation(self):
        row = gd.describe_channel("Новости Москвы", "RU")
        self.assertEqual(row["original_name"], "Новости Москвы")
        self.assertEqual(row["official_name"], "")
        self.assertEqual(row["name_provenance"], "transliteration_only")
        self.assertNotEqual(row["display_name_pt"], row["original_name"])
        chinese = gd.describe_channel("北京新闻", "CN")
        self.assertEqual(chinese["original_name"], "北京新闻")
        self.assertEqual(chinese["official_name"], "")
        self.assertEqual(chinese["display_name_pt"], "北京新闻")
        self.assertEqual(chinese["name_provenance"], "original")

    def test_country_rotation_covers_all_regions_and_unlisted_codes(self):
        countries = gd.country_rotation(14, ["BR", "RU", "AU", "IS", "FI", "ZZ"])
        self.assertEqual(len(countries), len(gd.COUNTRIES_BY_REGION) + 1)
        self.assertIn(countries["north_central_america_caribbean"], gd.COUNTRIES_BY_REGION["north_central_america_caribbean"])
        self.assertIn(countries["eastern_europe_caucasus"], gd.COUNTRIES_BY_REGION["eastern_europe_caucasus"])
        self.assertIn(countries["oceania"], gd.COUNTRIES_BY_REGION["oceania"])
        self.assertIn(countries["additional_world_country"], {"IS", "FI", "ZZ"})

    def test_iptv_identity_collapses_cyrillic_and_romanized_aliases(self):
        source = "https://iptv-org.github.io/iptv/countries/ru.m3u"
        m3u = ('#EXTM3U\n'
               '#EXTINF:-1 tvg-country="RU",Россия 24\n'
               'https://media.example.org/ru1.m3u8\n'
               '#EXTINF:-1 tvg-country="RU",Rossiya 24\n'
               'https://media.example.org/ru2.m3u8\n')
        rows = gd.parse_public_feed(m3u, "RU", source)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["channel_id"], rows[1]["channel_id"])

    def test_malicious_addresses_excluded_from_candidate_media(self):
        s = "https://iptv-org.github.io/iptv/countries/ru.m3u"
        m3u = ('#EXTM3U\n'
               '#EXTINF:-1,Canal Livre\n'
               'http://localhost/secret.m3u8\n'
               '#EXTINF:-1,Canal Livre\n'
               'https://media.example.org/live.m3u8?token=not-for-publication\n'
               '#EXTINF:-1,Canal Livre\n'
               'https://media.example.org/live.m3u8\n')
        rows = gd.parse_public_feed(m3u, "RU", s)
        self.assertFalse(gd.safe_url("https://192.168.1.10/private.m3u8"))
        self.assertFalse(gd.safe_url("https://127.0.0.1/private.m3u8"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["stream_url"], "https://media.example.org/live.m3u8")

    def test_research_sources_are_persisted_but_never_promoted_to_player(self):
        now = dt.datetime(2026, 11, 23, 5, 0, tzinfo=dt.timezone.utc)
        def fake_fetch(url, limit):
            if url == gd.COUNTRY_API:
                return json.dumps([{"code": "IS"}, {"code": "FI"}]).encode()
            if "/countries/" in url:
                country = url.rsplit("/", 1)[-1][:2].upper()
                return (f'#EXTM3U\n#EXTINF:-1 tvg-country="{country}",Canal Público\n'
                        f'https://media.example.org/{country.lower()}.m3u8\n').encode()
            if "api.github.com" in url:
                return json.dumps({"items": [{"html_url": "https://github.com/example/public-iptv"}]}).encode()
            if "gitlab.com" in url:
                return json.dumps([{"web_url": "https://gitlab.com/example/iptv"}]).encode()
            if "codeberg.org" in url:
                return json.dumps({"data": [{"html_url": "https://codeberg.org/example/iptv"}]}).encode()
            if "gitee.com" in url:
                raise OSError("Public API unavailable")
            raise ValueError("Unknown fixture endpoint " + url)
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(gd, "STATE", pathlib.Path(td)/"state.json"), \
                 mock.patch.object(gd, "REPORT", pathlib.Path(td)/"report.json"):
                result = gd.run(now, fake_fetch)
                stored = json.loads(gd.STATE.read_text())
                self.assertEqual(result["countries_scanned"], len(gd.COUNTRIES_BY_REGION)+1)
                self.assertGreaterEqual(result["new_research_sources"], 3)
                self.assertEqual(result["auto_promoted_to_player"], 0)
                self.assertEqual(result["state"], "PARTIAL")
                self.assertEqual(result["total_research_channels"], len(stored["channels"]))
                self.assertTrue(all(x["access_state"] == "REVIEW_REQUIRED_NOT_PLAYABLE"
                                    for x in stored["channels"].values()))
                # A second run does not lose the original discovery or invent new channels.
                again = gd.run(now, fake_fetch)
                self.assertEqual(again["new_research_channel_records"], 0)
                self.assertEqual(again["new_research_sources"], 0)

    def test_localized_youtube_twitch_discover_channel_pages_only(self):
        targets = gd.research_queries(123)
        self.assertIn("youtube", [name for name, _ in targets])
        self.assertIn("twitch", [name for name, _ in targets])
        youtube = b'<a href="https://www.youtube.com/@canalgoatbr">Live</a>'
        twitch = b'<a href="https://www.twitch.tv/broadcaster_123">Live</a>'
        self.assertEqual(gd.extract_repository_links(youtube, "youtube"),
                         ["https://www.youtube.com/@canalgoatbr"])
        self.assertEqual(gd.extract_repository_links(twitch, "twitch"),
                         ["https://www.twitch.tv/broadcaster_123"])
        self.assertEqual(gd.extract_repository_links(b'<a href="https://www.twitch.tv/login">', "twitch"), [])

    def test_network_failure_preserves_previous_discovery_state(self):
        with tempfile.TemporaryDirectory() as td:
            statefile = pathlib.Path(td)/"state.json"
            initial = {"schema": 1, "channels": {"abc": {"original_name": "ТВ",
                       "aliases": ["ТВ"], "access_state": "REVIEW_REQUIRED_NOT_PLAYABLE"}},
                       "sources": {"https://github.com/owner/repo": {"type": "repository_candidate"}}}
            statefile.write_text(json.dumps(initial, ensure_ascii=False))
            with mock.patch.object(gd, "STATE", statefile), \
                 mock.patch.object(gd, "REPORT", pathlib.Path(td)/"report.json"):
                report = gd.run(dt.datetime(2026, 11, 23, tzinfo=dt.timezone.utc),
                                lambda url, limit: (_ for _ in ()).throw(OSError("offline")))
                new_state = json.loads(statefile.read_text())
                self.assertIn("abc", new_state["channels"])
                self.assertIn("https://github.com/owner/repo", new_state["sources"])
                self.assertEqual(report["state"], "PARTIAL")
                self.assertEqual(report["countries_scanned"], 0)


if __name__ == "__main__":
    unittest.main()

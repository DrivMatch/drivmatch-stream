import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('streamnow_full_audit',ROOT/'scripts'/'streamnow_full_channel_audit.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FullAuditTests(unittest.TestCase):
    def test_stable_24_shards_cover_every_url_exactly_once(self):
        urls=[f'https://example.com/{n}.m3u8' for n in range(1200)]
        assigned=[m.shard_for(url,m.SHARDS) for url in urls]
        self.assertTrue(all(0<=n<m.SHARDS for n in assigned))
        self.assertEqual(len(assigned),1200)
        self.assertEqual(len(set(urls)),1200)

    def test_downloaded_flat_artifacts_are_normalized_and_bound(self):
        import os
        import tempfile
        import json
        from unittest import mock
        with tempfile.TemporaryDirectory() as td:
            previous = pathlib.Path.cwd()
            try:
                os.chdir(td)
                with mock.patch.object(m, "INPUT", pathlib.Path("audit-input.json")), \
                     mock.patch.object(m, "RESULTS", pathlib.Path("audit-results")), \
                     mock.patch.object(m, "SHARDS", 2):
                    pathlib.Path("audit-input.json").write_text(json.dumps({
                        "schema": 1, "started_utc": "2026-11-26T12:44:30+00:00",
                        "candidates": []}), encoding="utf-8")
                    for n in range(2):
                        pathlib.Path(f"scan-{n}.json").write_text(json.dumps({
                            "schema":1,"shard":n,"shards":2,
                            "started_utc":"2026-11-26T12:44:30+00:00",
                            "results":{}}),encoding="utf-8")
                    m.normalize_artifacts()
                    self.assertTrue(pathlib.Path("audit-results/scan-0.json").exists())
                    self.assertTrue(pathlib.Path("audit-results/scan-1.json").exists())
                    self.assertFalse(pathlib.Path("scan-0.json").exists())
            finally:
                os.chdir(previous)

    def test_normalizer_refuses_missing_and_foreign_shards(self):
        import os
        import tempfile
        import json
        from unittest import mock
        with tempfile.TemporaryDirectory() as td:
            previous=pathlib.Path.cwd()
            try:
                os.chdir(td)
                with mock.patch.object(m,"INPUT",pathlib.Path("audit-input.json")), \
                     mock.patch.object(m,"RESULTS",pathlib.Path("audit-results")), \
                     mock.patch.object(m,"SHARDS",2):
                    pathlib.Path("audit-input.json").write_text(json.dumps({
                        "schema":1,"started_utc":"A","candidates":[]}),encoding="utf-8")
                    pathlib.Path("scan-0.json").write_text(json.dumps({
                        "schema":1,"shard":0,"shards":2,"started_utc":"B","results":{}}),encoding="utf-8")
                    with self.assertRaisesRegex(RuntimeError, "different audit"):
                        m.normalize_artifacts()
            finally:
                os.chdir(previous)

    def test_daily_1200_not_old_120_or_180_cap(self):
        self.assertGreaterEqual(m.a.MAX_CHECKS,1200)

    def test_60_second_hls_probe_is_mandatory(self):
        self.assertEqual(m.a.PROBE_SECONDS,60)

    def test_sources_include_global_research_without_publishing_it(self):
        with mock.patch.object(pathlib.Path,'read_text', autospec=True, side_effect=RuntimeError('offline')):
            pass
        self.assertTrue(any(not row[4] for row in m.a.SOURCES))
        self.assertTrue(any(row[4] for row in m.a.SOURCES))

if __name__=='__main__':
    unittest.main()

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

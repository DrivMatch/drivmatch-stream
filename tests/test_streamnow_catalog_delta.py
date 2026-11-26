import unittest
from scripts.daily_channel_autopilot import published_channel_signatures


class PublishedChannelDeltaTests(unittest.TestCase):
    def test_added_removed_and_unchanged(self):
        old = '#EXTM3U\n#EXTINF:-1 tvg-country="BR",One\nhttps://example.com/one.m3u8\n#EXTINF:-1 tvg-country="US",Two\nhttps://example.com/two.m3u8\n'
        new = '#EXTM3U\n#EXTINF:-1 tvg-country="BR",One\nhttps://example.com/one.m3u8\n#EXTINF:-1 tvg-country="PT",Three\nhttps://example.com/three.m3u8\n'
        before = published_channel_signatures(old)
        after = published_channel_signatures(new)
        self.assertEqual(len(after-before), 1)
        self.assertEqual(len(before-after), 1)
        self.assertEqual(len(before & after), 1)

    def test_volatile_probe_date_does_not_fake_churn(self):
        old = '#EXTM3U\n#EXTINF:-1 dm-auto-checked="2026-11-25" tvg-country="BR",One\nhttps://example.com/one.m3u8\n'
        new = old.replace('2026-11-25', '2026-11-26')
        self.assertEqual(published_channel_signatures(old), published_channel_signatures(new))

    def test_changed_source_is_not_silently_counted_as_unchanged(self):
        old = '#EXTM3U\n#EXTINF:-1 tvg-country="BR",One\nhttps://example.com/one.m3u8\n'
        new = old.replace('one.m3u8', 'replacement.m3u8')
        self.assertEqual(len(published_channel_signatures(new)-published_channel_signatures(old)), 1)
        self.assertEqual(len(published_channel_signatures(old)-published_channel_signatures(new)), 1)

if __name__ == '__main__':
    unittest.main()

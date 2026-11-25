"""Channel verification must not prefer news/sports to other TV genres."""
import unittest
from scripts.daily_channel_autopilot import geographically_balanced

class ChannelCategoryBalanceTests(unittest.TestCase):
    def test_all_genres_receive_slots_even_when_news_dominates_feed(self):
        items=[{"country":"BR","genre":"news","id":"n"+str(i)} for i in range(100)]
        items.extend([
            {"country":"BR","genre":"sports","id":"s"},
            {"country":"BR","genre":"movies","id":"m"},
            {"country":"BR","genre":"kids","id":"k"},
            {"country":"BR","genre":"music","id":"u"},
            {"country":"BR","genre":"education","id":"e"},
            {"country":"BR","genre":"religion","id":"r"},
            {"country":"BR","genre":"other","id":"o"},
        ])
        selected=geographically_balanced(items,14)
        genres={x["genre"] for x in selected}
        self.assertEqual(genres,{"news","sports","movies","kids","music","education","religion","other"})
        self.assertEqual(len(selected),14)

    def test_unknown_category_kept(self):
        selected=geographically_balanced([
            {"country":"JP","genre":"travel","id":"t"},
            {"country":"BR","genre":"science","id":"x"}],2)
        self.assertEqual({x["id"] for x in selected},{"x","t"})

if __name__=="__main__":unittest.main()

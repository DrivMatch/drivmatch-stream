"""YouTube LIVE research should not invent live channels or change personal data."""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import youtube_live_discovery as yt

NOW=dt.datetime(2026,11,25,5,0,tzinfo=dt.timezone.utc)
VID="abcdefghi01"
ID="UCknLrEdhRCp1aegoMqRaCZg"

class YouTubeLiveResearchTests(unittest.TestCase):
    def test_every_domain_rotation_and_essential_brands(self):
        strings=" ".join(q[2] for q in yt.QUERIES).lower()
        for term in ("cnn","bloomberg","cazétv","ge tv","times brasil",
                     "volleyball","tennis","basketball","nfl","football",
                     "formula 1","nascar","athletics","gymnastics","flamengo","palmeiras"):
            self.assertIn(term,strings)
        self.assertEqual(len(yt.selected_queries(NOW)),yt.MAX_SEARCHES)
        self.assertLessEqual(len(yt.selected_queries(NOW)),18)

    def test_no_api_key_returns_research_only_without_ever_touching_live_catalog(self):
        with tempfile.TemporaryDirectory() as d, patch.dict("os.environ",{},clear=True), \
             patch.object(yt,"STATE",Path(d)/"state.json"), \
             patch.object(yt,"REPORT",Path(d)/"report.json"):
            output=yt.run(NOW)
            self.assertEqual(output["auto_published"],0)
            self.assertIn("YOUTUBE_API_KEY_NOT_CONFIGURED",output["errors"])
            self.assertEqual(json.loads(yt.STATE.read_text())["candidates"],{})

    def test_famous_brand_search_result_without_official_channel_id_never_eligible(self):
        other="UCaaaaaaaaaaaaaaaaaaaaaa"
        def fetch(endpoint,params):
            if endpoint=="search":
                return {"items":[{"id":{"videoId":VID},"snippet":{
                    "channelId":other,"title":"CNN Bloomberg unofficial",
                    "channelTitle":"CNN Live"}}]}
            self.fail("Unapproved candidate must not request video eligibility API")
        with tempfile.TemporaryDirectory() as d,patch.dict("os.environ",{"STREAMNOW_YOUTUBE_DATA_API_KEY":"dummy"}), \
             patch.object(yt,"STATE",Path(d)/"state.json"), \
             patch.object(yt,"REPORT",Path(d)/"report.json"), \
             patch.object(yt,"official_ids",lambda:{ID:{"name":"DW News","genre":"news","code":"DE","url":"https://youtube.com/@dwnews","id":"dw"}}):
            result=yt.run(NOW,fetch)
            self.assertEqual(result["auto_published"],0)
            self.assertEqual(result["api_eligible_curated_lives"],[])
            first=next(iter(json.loads(yt.STATE.read_text())["candidates"].values()))
            self.assertEqual(first["identity"],"REVIEW_PENDING")

    def test_only_curated_and_embeddable_current_live_eligible(self):
        def fetch(endpoint,params):
            if endpoint=="search":
                return {"items":[{"id":{"videoId":VID},"snippet":{"channelId":ID,"title":"Live","channelTitle":"DW"}}]}
            return {"items":[{"id":VID,"snippet":{"liveBroadcastContent":"live"},"status":{"embeddable":True}}]}
        with tempfile.TemporaryDirectory() as d,patch.dict("os.environ",{"STREAMNOW_YOUTUBE_DATA_API_KEY":"dummy"}), \
             patch.object(yt,"STATE",Path(d)/"state.json"), \
             patch.object(yt,"REPORT",Path(d)/"report.json"), \
             patch.object(yt,"official_ids",lambda:{ID:{"name":"DW News","genre":"news","code":"DE","url":"https://youtube.com/@dwnews","id":"dw"}}):
            result=yt.run(NOW,fetch)
            self.assertEqual(result["auto_published"],0)
            self.assertEqual(len(result["api_eligible_curated_lives"]),1)
            self.assertEqual(result["api_eligible_curated_lives"][0]["rights_status"],"UNVERIFIED_TERRITORY_AND_EVENT")

if __name__=="__main__":unittest.main()

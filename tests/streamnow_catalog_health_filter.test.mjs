import test from 'node:test';
import assert from 'node:assert/strict';
import {filterVerifiedFailedStreams} from '../cloudflare/catalog-health.mjs';

const m3u='#EXTM3U\n#EXTINF:-1 tvg-country="BR",One\nhttps://example.com/one.m3u8\n#EXTINF:-1 tvg-country="US",Two\nhttps://example.com/two.m3u8\n';
const complete={schema:1,status:'COMPLETE_HLS',tested:2,hidden_urls:['https://example.com/two.m3u8']};

test('complete signed-off health hides failed globally without deleting playable streams',()=>{
 const out=filterVerifiedFailedStreams(m3u,complete);
 assert.ok(out.includes('https://example.com/one.m3u8'));
 assert.ok(!out.includes('https://example.com/two.m3u8'));
 assert.ok(out.includes('#DM_HEALTH_HIDDEN:1'));
});
test('unknown or incomplete health must not hide any channel',()=>{
 assert.equal(filterVerifiedFailedStreams(m3u,null),m3u);
 assert.equal(filterVerifiedFailedStreams(m3u,{status:'PARTIAL',hidden_urls:['https://example.com/one.m3u8']}),m3u);
});
test('not tested is not failed',()=>{
 const out=filterVerifiedFailedStreams(m3u,{...complete,hidden_urls:[]});
 assert.ok(out.includes('https://example.com/two.m3u8'));
});
test('do not alter unrelated playlists without matching URLs',()=>{
 const out=filterVerifiedFailedStreams(m3u,{...complete,hidden_urls:['https://evil.invalid/unknown.m3u8']});
 assert.equal(out,m3u);
});

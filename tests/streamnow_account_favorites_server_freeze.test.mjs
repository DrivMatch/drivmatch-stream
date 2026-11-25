import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("P0 account favorites API refuses all delete calls",()=>{
  const backend=read("cloudflare/independent-access.mjs");
  assert.match(backend,/FAVORITES_DELETION_LOCKED/);
  assert.doesNotMatch(backend,/DELETE FROM stream_favorites WHERE user_id/);
  assert.match(backend,/INSERT OR IGNORE INTO stream_favorites/);
});
test("P0 archival migration is additive and blocks direct D1 modifications",()=>{
  const sql=read("migrations/0009_stream_favorites_immutable_archive.sql");
  assert.match(sql,/INSERT OR IGNORE INTO stream_favorites_archive/);
  assert.match(sql,/SELECT user_id,favorite_key,'baseline-before-freeze'/);
  assert.match(sql,/BEFORE DELETE ON stream_favorites/);
  assert.match(sql,/BEFORE UPDATE ON stream_favorites/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM stream_favorites/i);
});

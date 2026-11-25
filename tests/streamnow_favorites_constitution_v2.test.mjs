import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("canon: favorites belong to authenticated account, not local browser",()=>{
 const constitution=read("docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md");
 const agents=read("AGENTS.md");
 assert.match(constitution,/CONSTITUIÇÃO DE PRESERVAÇÃO DE FAVORITOS v2\.0 — CANÔNICA/);
 assert.match(constitution,/CONSTITUIÇÃO CANÔNICA DE FAVORITOS POR CONTA/);
 assert.match(constitution,/CONTA STREAM NOW/);
 assert.match(constitution,/stream_favorites_archive/);
 assert.match(constitution,/CHANGE CONTROL|Change Control/);
 assert.match(constitution,/02h05, 04h05 e 06h05/);
 assert.match(agents,/all interfaces|all clients/i);
 assert.match(agents,/server-side user_id/);
 assert.match(agents,/streamnow_multidevice_favorites\.test\.mjs/);
});
test("database archive and the per-user no deletion guard remain invariant",()=>{
 const sql=read("migrations/0009_stream_favorites_immutable_archive.sql");
 assert.match(sql,/BEFORE DELETE ON stream_favorites/);
 assert.match(sql,/BEFORE UPDATE ON stream_favorites/);
 assert.match(sql,/INSERT OR IGNORE INTO stream_favorites_archive/);
 const api=read("cloudflare/independent-access.mjs");
 assert.match(api,/FAVORITES_DELETION_LOCKED/);
 assert.match(api,/WHERE user_id=\?/);
});

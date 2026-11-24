import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Samsung TV loads CSS with a cache-busting revision and an inline dark fallback",()=>{
 const html=read("site/tv.html");
 assert.match(html,/streamnow-samsung-fallback-theme/);
 assert.match(html,/background:#080808!important/);
 assert.match(html,/border-bottom:3px solid #e60036!important/);
 assert.match(html,/tv\\.css\\?v=20261124-samsung-red-recovery1/);
 assert.match(html,/graphite\\.css\\?v=20261124-samsung-red-recovery1/);
 assert.match(html,/tv\\.js\\?v=20261124-samsung-red-recovery1/);
});
test("Existing favorites stay in place; recovery is explicit, additive and backed up",()=>{
 const html=read("site/tv.html"), js=read("site/tv.js");
 assert.match(html,/id="recover-legacy-favorites"/);
 assert.match(js,/var STORE="drivmatch-tv-guide-favorites-v1"/);
 assert.match(js,/LEGACY_FAV_STORE="drivmatch-stream-favorites-v1"/);
 assert.match(js,/FAV_RECOVERY_BACKUP="drivmatch-tv-favorites-recovery-backup-v1"/);
 assert.match(js,/on\\(D\\("recover-legacy-favorites"\\),"click",recoverLegacyFavorites\\)/);
 assert.match(js,/localStorage\\.setItem\\(STORE,JSON\\.stringify\\(merged\\)\\)/);
 assert.doesNotMatch(js,/localStorage\\.removeItem\\((?:STORE|LEGACY_FAV_STORE|FAV_RECOVERY_BACKUP)\\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {WATCHED,eligibleRun,shouldRetry,runIncidentKey,missedSchedules,saoPauloParts,shouldRecoverMissing} from '../scripts/streamnow_ops_policy.mjs';
const run=(override={})=>({
 id:123,name:'Stream Now full-channel health audit',head_branch:'main',
 status:'completed',conclusion:'failure',run_attempt:1,
 ...override
});
test('six operational workflows covered, including account-favorite integrity',()=>{
 assert.equal(WATCHED.size,6);
 assert.ok(WATCHED.has('Stream Now P0 favorites integrity — independent account audits'));
});
test('one bounded rerun only, and only on main branch',()=>{
 assert.equal(shouldRetry(run()),true);
 assert.equal(shouldRetry(run({run_attempt:2})),false);
 assert.equal(shouldRetry(run({head_branch:'untrusted-pr'})),false);
 assert.equal(shouldRetry(run({conclusion:'success'})),false);
 assert.equal(shouldRetry(run(),true),false);
});
test('stable incident key prevents duplicate reports',()=>{
 assert.equal(runIncidentKey(run()),'run:123');
});
test('Sao Paulo local timestamps are calendar correct',()=>{
 assert.deepEqual(saoPauloParts('2026-11-26T12:30:00Z'),
   {date:'2026-11-26',hour:9,minute:30});
});
test('missing schedule detection respects grace and actual trigger',()=>{
 const noRuns=[];
 assert.deepEqual(missedSchedules(noRuns,'2026-11-26T10:00:00Z').map(x=>x.type),['02','04']);
 assert.deepEqual(missedSchedules(noRuns,'2026-11-26T08:10:00Z').map(x=>x.type),['02']);
 const got=[
  {name:'DrivMatch - Autopiloto diario de canais',head_branch:'main',created_at:'2026-11-26T05:06:00Z'},
  {name:'Stream Now independent 04h and 06h channel audits',head_branch:'main',created_at:'2026-11-26T07:04:00Z'}
 ];
 assert.deepEqual(missedSchedules(got,'2026-11-26T08:30:00Z').map(x=>x.type),[]);
});

test('one-shot recovery only when daily is absent or when auditors can safely run',()=>{
 const now='2026-11-26T13:00:00Z';
 const complete=[{name:'DrivMatch - Autopiloto diario de canais',head_branch:'main',
   created_at:'2026-11-26T11:00:00Z',status:'completed',conclusion:'success'}];
 assert.equal(shouldRecoverMissing('02',complete,now),false);
 assert.equal(shouldRecoverMissing('04',complete,now),true);
 assert.equal(shouldRecoverMissing('06',complete,now),true);
 assert.equal(shouldRecoverMissing('02',[],now),true);
 assert.equal(shouldRecoverMissing('04',[],now),false);
 const active=[{...complete[0],status:'in_progress',conclusion:null}];
 assert.equal(shouldRecoverMissing('02',active,now),false);
});

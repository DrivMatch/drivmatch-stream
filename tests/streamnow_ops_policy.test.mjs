import test from 'node:test';
import assert from 'node:assert/strict';
import {WATCHED,eligibleRun,shouldRetry,runIncidentKey,missedSchedules,saoPauloParts} from '../scripts/streamnow_ops_policy.mjs';
const run=(override={})=>({
 id:123,name:'Stream Now full-channel health audit',head_branch:'main',
 status:'completed',conclusion:'failure',run_attempt:1,
 ...override
});
test('all five operational workflows covered',()=>assert.equal(WATCHED.size,5));
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
 assert.deepEqual(missedSchedules(noRuns,'2026-11-26T10:00:00Z').map(x=>x.type),['02']);
 assert.deepEqual(missedSchedules(noRuns,'2026-11-26T08:10:00Z').map(x=>x.type),['02','04']);
 const got=[
  {name:'DrivMatch - Autopiloto diario de canais',head_branch:'main',created_at:'2026-11-26T05:06:00Z'},
  {name:'Stream Now independent 04h and 06h channel audits',head_branch:'main',created_at:'2026-11-26T07:04:00Z'}
 ];
 assert.deepEqual(missedSchedules(got,'2026-11-26T08:30:00Z').map(x=>x.type),[]);
});

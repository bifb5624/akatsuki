import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSample,setShift,reviewShift,balance,grantFor,setGrant,periodMatches,monthDates} from '../src/team.js';
const sample=()=>createSample('2026-11-01');
test('週は月曜始まりで年・月をまたいでも正しい',()=>{
 assert.equal(periodMatches('2025-12-29','week','2026-01-01'),true);
 assert.equal(periodMatches('2026-01-04','week','2026-01-01'),true);
 assert.equal(periodMatches('2026-01-05','week','2026-01-01'),false);
 assert.equal(monthDates('2024-02').length,29);
});
test('半休申請は0.5日を予約し、承認後も二重計上しない',()=>{
 let state=setShift(sample(),'a',{member:'a',date:'2026-11-02',type:'am'});
 const grant=grantFor(state,'a','2026-11-02');
 assert.deepEqual(balance(state,grant),{approved:0,pending:.5,available:9.5});
 state=reviewShift(state,'owner',state.shifts[0].id,'approved');
 assert.deepEqual(balance(state,grant),{approved:.5,pending:0,available:9.5});
 state=setShift(state,'a',{member:'a',date:'2026-11-02',type:'paid'});
 assert.equal(state.shifts.length,1);assert.equal(state.shifts[0].status,'pending');assert.equal(balance(state,grant).available,9);
});
test('本人以外の変更・社員の承認・過剰申請・未設定期間を拒否',()=>{
 assert.throws(()=>setShift(sample(),'a',{member:'b',date:'2026-11-02',type:'am'}));
 let state=setGrant(sample(),'owner',{member:'a',start:'2026-01-01',end:'2026-12-31',days:.5});
 assert.throws(()=>setShift(state,'a',{member:'a',date:'2026-11-02',type:'paid'}));
 state=setShift(state,'a',{member:'a',date:'2026-11-02',type:'am'});
 assert.throws(()=>reviewShift(state,'a',state.shifts[0].id,'approved'));
 assert.throws(()=>setShift(state,'a',{member:'a',date:'2026-11-03',type:'pm'}));
 assert.throws(()=>setShift(state,'a',{member:'a',date:'2027-01-01',type:'am'}));
 state=reviewShift(state,'owner',state.shifts[0].id,'rejected');
 assert.equal(balance(state,state.grants.find(g=>g.member==='a')).available,.5);
});
test('付与期間の重複と使用済み以下への減額を拒否、非重複期間は追加',()=>{
 let state=setShift(sample(),'a',{member:'a',date:'2026-11-02',type:'paid'});
 assert.throws(()=>setGrant(state,'owner',{member:'a',start:'2026-01-01',end:'2026-12-31',days:0}));
 assert.throws(()=>setGrant(state,'owner',{member:'a',start:'2026-06-01',end:'2027-05-31',days:10}));
 assert.throws(()=>setGrant(state,'a',{member:'a',start:'2027-01-01',end:'2027-12-31',days:10}));
 state=setGrant(state,'owner',{member:'a',start:'2027-01-01',end:'2027-12-31',days:11});
 assert.equal(grantFor(state,'a','2027-01-02').days,11);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addMonths,nextDate,inPeriod} from '../src/schedule.js';
test('月末と閏年を補正する',()=>{
 assert.equal(addMonths('2024-02-29',12),'2025-02-28');
 assert.equal(addMonths('2026-08-31',6),'2027-02-28');
 assert.equal(addMonths('2026-02-30',1),null);
});
test('最新交換履歴を起点にし、不明な周期を推測しない',()=>{
 const a={installed:'2020-01-01',months:12,history:[{date:'2025-06-01'},{date:'2024-01-01'}]};
 assert.equal(nextDate(a),'2026-06-01');
 assert.equal(nextDate({...a,months:0}),null);
 assert.equal(nextDate({...a,installed:'',history:[]}),null);
});
test('年をまたぐ半年と期限超過・未定を区別する',()=>{
 assert.equal(inPeriod('2027-05-01','six','2026-11-01'),true);
 assert.equal(inPeriod('2027-05-02','six','2026-11-01'),false);
 assert.equal(inPeriod('2026-10-31','six','2026-11-01'),false);
 assert.equal(inPeriod('2026-10-31','overdue','2026-11-01'),true);
 assert.equal(inPeriod(null,'unknown','2026-11-01'),true);
 assert.equal(inPeriod('2027-01-01','year','2026-11-01'),false);
});

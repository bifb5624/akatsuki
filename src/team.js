import {addMonths} from './schedule.js';
export const shiftTypes = {work:'出勤',off:'公休',paid:'有給（1日）',am:'午前休',pm:'午後休'};
export const leaveUnits = type => ({paid:1,am:0.5,pm:0.5}[type] || 0);
export const members = [{id:'owner',name:'社長（仮）',role:'admin'},{id:'a',name:'社員A（仮）',role:'staff'},{id:'b',name:'社員B（仮）',role:'staff'},{id:'c',name:'社員C（仮）',role:'staff'}];
export function shiftDate(date, days) {
 const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function monthDates(month) {
 const first=`${month}-01`;const end=addMonths(first,1);const days=[];
 for(let d=first;d<end;d=shiftDate(d,1)) days.push(d);
 return days;
}
export function periodMatches(date,period,today){
 if(period==='today')return date===today;
 if(period==='month')return date.slice(0,7)===today.slice(0,7);
 const weekday=new Date(`${today}T00:00:00Z`).getUTCDay();
 const start=shiftDate(today,-((weekday+6)%7));return date>=start&&date<=shiftDate(start,6);
}
export function grantFor(state,member,date){return state.grants.find(g=>g.member===member&&date>=g.start&&date<=g.end);}
export function balance(state,grant,excludeId){
 const entries=state.shifts.filter(s=>s.id!==excludeId&&s.member===grant.member&&s.date>=grant.start&&s.date<=grant.end);
 const approved=entries.filter(s=>s.status==='approved').reduce((n,s)=>n+leaveUnits(s.type),0);
 const pending=entries.filter(s=>s.status==='pending').reduce((n,s)=>n+leaveUnits(s.type),0);
 return {approved,pending,available:grant.days-approved-pending};
}
export function setShift(state,actor,input){
 if(input.member!==actor)throw Error('シフトを変更できるのは自分の行だけです。');
 if(!shiftTypes[input.type]||!addMonths(input.date,0))throw Error('日付と勤務区分を確認してください。');
 const existing=state.shifts.find(s=>s.member===actor&&s.date===input.date);
 if(existing?.type===input.type&&existing.status!=='rejected')return state;
 const units=leaveUnits(input.type);
 if(units){const grant=grantFor(state,actor,input.date);if(!grant)throw Error('この日の有給日数が設定されていません。管理者に設定を依頼してください。');
 if(balance(state,grant,existing?.id).available<units)throw Error('有給の残日数が足りません。申請中の日数も含めて確認してください。');}
 const entry={id:existing?.id||crypto.randomUUID(),member:actor,date:input.date,type:input.type,status:units?'pending':'approved'};
 return {...state,shifts:[...state.shifts.filter(s=>s.id!==existing?.id),entry],audit:[...state.audit,{actor,action:'shift',before:existing??null,after:entry,at:new Date().toISOString()}]};
}
export function setShifts(state,actor,input){
 if(input.member!==actor||!Array.isArray(input.dates)||!input.dates.length||input.dates.length>31||new Set(input.dates).size!==input.dates.length)throw Error('一括入力する日付を確認してください。');
 return input.dates.reduce((next,date)=>input.onlyUnset&&next.shifts.some(s=>s.member===actor&&s.date===date)?next:setShift(next,actor,{member:actor,date,type:input.type}),state);
}
export function reviewShift(state,actor,id,status,directory=members){
 if(directory.find(m=>m.id===actor)?.role!=='admin')throw Error('管理者だけが承認できます。');
 if(!['approved','rejected'].includes(status))throw Error('操作を確認してください。');
 const entry=state.shifts.find(s=>s.id===id);if(!entry||entry.status!=='pending')throw Error('申請中の記録が見つかりません。');
 return {...state,shifts:state.shifts.map(s=>s.id===id?{...s,status}:s),audit:[...state.audit,{actor,action:status,id,at:new Date().toISOString()}]};
}
export function setGrant(state,actor,input,directory=members){
 if(directory.find(m=>m.id===actor)?.role!=='admin')throw Error('管理者だけが日数を設定できます。');
 if(!directory.some(m=>m.id===input.member)||!addMonths(input.start,0)||!addMonths(input.end,0)||input.end<input.start||!Number.isFinite(input.days)||input.days<0||input.days>100||!Number.isInteger(input.days*2))throw Error('対象者・期間・日数（0〜100日、0.5日単位）を確認してください。');
 const existing=state.grants.find(g=>g.member===input.member&&g.start===input.start&&g.end===input.end);
 if(state.grants.some(g=>g.id!==existing?.id&&g.member===input.member&&g.start<=input.end&&g.end>=input.start))throw Error('設定済みの期間と重なっています。同じ開始日・終了日なら日数を更新できます。');
 const grant={...input,id:existing?.id||crypto.randomUUID()};
 if(balance(state,grant).available<0)throw Error('確定・申請中の日数より少なくすることはできません。');
 return {...state,grants:[...state.grants.filter(g=>g.id!==existing?.id),grant],audit:[...state.audit,{actor,action:'grant',after:grant,at:new Date().toISOString()}]};
}
export function createSample(today){
 const year=today.slice(0,4);
 return {version:1,events:[
 {id:'visit',title:'管理会社との打ち合わせ',date:today,time:'10:00',kind:'予定',category:'来客対応',building:'事務所',member:'owner',done:false,note:'デモ用の予定です'},
 {id:'meter',title:'渋谷ビルのメーター確認',date:today,time:'14:00',kind:'予定',category:'メーター検査',building:'渋谷区のビル',member:'a',done:false,note:''},
 {id:'task',title:'新宿ビルの点検項目を整理',date:shiftDate(today,2),time:'',kind:'タスク',category:'ビル点検',building:'新宿区のビル',member:'b',done:false,note:''}],
 shifts:[],grants:members.map(m=>({id:`${year}-${m.id}`,member:m.id,start:`${year}-01-01`,end:`${year}-12-31`,days:10})),audit:[]};
}

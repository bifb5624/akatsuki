import {nextDate,inPeriod,japanToday} from './schedule.js';
const today=japanToday();
const key='akatsuki-demo-v1';
const sample=[
 {id:'1',building:'渋谷区のビル',floor:'1階',name:'エントランス照明',category:'照明',installed:'2023-11-15',months:36,note:'画面確認用の仮の周期',history:[]},
 {id:'2',building:'新宿区のビル',floor:'3階',name:'会議室エアコン',category:'空調',installed:'2017-03-01',months:120,note:'画面確認用の仮の周期',history:[]},
 {id:'3',building:'渋谷区のビル',floor:'2階',name:'給湯室の水栓',category:'給排水',installed:'2016-10-01',months:120,note:'画面確認用の仮の周期',history:[]},
 {id:'4',building:'新宿区のビル',floor:'1階',name:'共用部の換気扇',category:'空調',installed:'',months:0,note:'型番と設置日を確認する',history:[]}
];
let assets=structuredClone(sample),storageError='',remoteSave=null,entityProfiles=[{id:'akatsuki-trade',name:'暁トレイド株式会社',buildings:[{name:'渋谷区のビル'},{name:'新宿区のビル'}]}];
export function configureEquipment(items,save,entities){assets=items;remoteSave=save;entityProfiles=entities?.length?entities:entityProfiles;storageError='';}
try { const saved=JSON.parse(localStorage.getItem(key)); if(Array.isArray(saved)&&saved.every(a=>typeof a.id==='string'&&typeof a.name==='string'&&Array.isArray(a.history))) assets=saved; } catch {storageError='保存データを読み込めなかったため、サンプルを表示しています。';}
let filters={entityId:'all',building:'all',floor:'all',category:'all',period:'all',search:'',sort:'date'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periods={all:'すべての予定',overdue:'期限超過',month:'今月',six:'今後6か月',year:'今年',unknown:'時期未定'};
function persist(){try{localStorage.setItem(key,JSON.stringify(assets));storageError='';}catch{storageError='ブラウザに保存できませんでした。今回の入力は画面を閉じると失われます。';}}
function options(values,selected){return '<option value="all">すべて</option>'+values.map(v=>`<option ${v===selected?'selected':''}>${esc(v)}</option>`).join('');}
function status(date){return !date?'時期未定':date<today?'期限超過':inPeriod(date,'month',today)?'今月の予定':'予定あり';}
export function renderEquipment(){
 const rows=assets.filter(a=>(filters.entityId==='all'||(a.entityId||'akatsuki-trade')===filters.entityId)&&['building','floor','category'].every(k=>filters[k]==='all'||a[k]===filters[k])&&`${a.name} ${a.note}`.includes(filters.search)&&inPeriod(nextDate(a),filters.period,today)).sort((a,b)=>filters.sort==='name'?a.name.localeCompare(b.name,'ja'):(nextDate(a)||'9999').localeCompare(nextDate(b)||'9999'));
 document.querySelector('#view').innerHTML=`${storageError?`<p role="alert">${esc(storageError)}</p>`:''} <section class="heading"><div><p class="eyebrow">MAINTENANCE OVERVIEW</p><h1>設備と交換予定</h1><p>交換のタイミングを見渡して、次の作業を計画しましょう。</p></div><button class="primary" id="add">＋ 設備を追加</button></section>
 <section class="cards">${[['overdue','期限超過'],['month','今月の交換'],['six','今後6か月'],['unknown','時期の確認が必要']].map(([period,label])=>`<button class="card ${filters.period===period?'selected':''}" data-period="${period}"><span>${label}</span><strong>${assets.filter(a=>inPeriod(nextDate(a),period,today)).length}<small> 件</small></strong><span class="card-foot">${period==='overdue'?'予定を見直す':'設備を確認する'} ↗</span></button>`).join('')}</section>
 <section class="panel"><div class="panel-title"><div><h2>交換予定一覧</h2><p>交換周期は会社の目安です。法定耐用年数とは異なります。</p></div><span>${rows.length} 件</span></div>
 <div class="filters"><label>会社<select data-filter="entityId">${options(entityProfiles.map(entity=>entity.id),filters.entityId).replaceAll(/>([^<]+)</g,(match,value)=>`>${esc(entityProfiles.find(entity=>entity.id===value)?.name||value)}<`)}</select></label><label>ビル<select data-filter="building">${options([...new Set(assets.filter(a=>filters.entityId==='all'||(a.entityId||'akatsuki-trade')===filters.entityId).map(a=>a.building))],filters.building)}</select></label><label>階<select data-filter="floor">${options([...new Set(assets.map(a=>a.floor))],filters.floor)}</select></label><label>項目<select data-filter="category">${options([...new Set(assets.map(a=>a.category))],filters.category)}</select></label><label>期間<select data-filter="period">${Object.entries(periods).map(([k,v])=>`<option value="${k}" ${k===filters.period?'selected':''}>${v}</option>`).join('')}</select></label><label>並び順<select data-filter="sort"><option value="date">交換予定が近い順</option><option value="name" ${filters.sort==='name'?'selected':''}>備品名順</option></select></label><label class="search">備品を検索<input id="search" placeholder="備品名・メモ" value="${esc(filters.search)}"></label></div>
 <div class="table-scroll"><table><thead><tr><th>設備・備品</th><th>会社</th><th>ビル / 階</th><th>次回の交換目安</th><th>採用周期</th><th>状態</th><th>操作</th></tr></thead><tbody>${rows.map(a=>{const date=nextDate(a);return `<tr><td><b>${esc(a.name)}</b><small>${esc(a.category)}</small></td><td>${esc(entityProfiles.find(entity=>entity.id===(a.entityId||'akatsuki-trade'))?.name||'未設定')}</td><td>${esc(a.building)}<small>${esc(a.floor)}</small></td><td>${date??'未設定'}</td><td>${a.months?`${esc(a.months)}か月`:'未設定'}</td><td><span class="badge ${date&&date<today?'late':''}">${status(date)}</span></td><td><button class="text-button" data-open="${esc(a.id)}">詳細・交換記録 →</button></td></tr>`;}).join('')||'<tr><td colspan="7" class="empty">条件に合う設備はありません。</td></tr>'}</tbody></table></div></section>
 <section class="bottom-grid"><article><span class="eyebrow">RECEIPTS</span><h2>領収書はGoogleドライブから</h2><p>指定フォルダ → 読み取り → 確認 → 経費一覧。元ファイルを残し、重複を防ぐ連携を予定しています。</p><span class="badge">Googleドライブ連携は未接続</span></article><article><span class="eyebrow">LOCAL PARTNERS</span><h2>渋谷区・新宿区周辺の業者比較</h2><p>料金・対応地域・実績・保証を比較。根拠となるサイトを添えて、見積依頼につなげます。</p><span class="badge">業者調査・依頼書は準備中</span></article></section><dialog id="editor"></dialog>`;
 document.querySelector('#add').onclick=()=>openEditor();
 document.querySelectorAll('[data-filter]').forEach(el=>el.onchange=()=>{filters[el.dataset.filter]=el.value;renderEquipment();});
 document.querySelector('#search').oninput=e=>{const pos=e.target.selectionStart;filters.search=e.target.value;renderEquipment();const input=document.querySelector('#search');input.focus();input.setSelectionRange(pos,pos);};
 document.querySelectorAll('[data-period]').forEach(el=>el.onclick=()=>{filters.period=el.dataset.period;renderEquipment();});
 document.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>openEditor(assets.find(a=>a.id===el.dataset.open)));
}
function openEditor(asset){
 const dialog=document.querySelector('#editor');
 dialog.innerHTML=`<div class="dialog-head"><h2>${asset?esc(asset.name):'設備を追加'}</h2><button id="close" aria-label="閉じる">×</button></div>${asset?`<p>${esc(entityProfiles.find(entity=>entity.id===(asset.entityId||'akatsuki-trade'))?.name||'')} / ${esc(asset.building)}</p><p>設置日：${esc(asset.installed)||'未設定'} / 次回目安：${nextDate(asset)||'未設定'}</p><p>${esc(asset.note)}</p><h3>交換履歴</h3>${asset.history.length?`<ul>${asset.history.map(h=>`<li>${esc(h.date)} · 作業者 ${esc(h.worker)} · 立会者 ${esc(h.witness)||'未入力'}</li>`).join('')}</ul>`:'<p>交換記録はまだありません。</p>'}<h3>交換を記録</h3><form id="record"><label>交換日<input name="date" type="date" max="${today}" required value="${today}"></label><label>作業者<input name="worker" maxlength="80" required></label><label>立会者（任意）<input name="witness" maxlength="80"></label><button class="primary">交換履歴を追加</button></form><hr><h3>交換周期の見直し</h3><form id="cycle"><label>採用周期（月）<input name="months" type="number" min="1" max="1200" required value="${asset.months||''}"></label><label>根拠・変更理由<input name="note" maxlength="500" required value="${esc(asset.note)}"></label><button>周期を保存</button></form>`:`<form id="create"><label>備品名<input name="name" maxlength="100" required></label><label>会社<select name="entityId" id="asset-entity">${entityProfiles.map(entity=>`<option value="${esc(entity.id)}">${esc(entity.name)}</option>`).join('')}</select></label><label>ビル<select name="building" id="asset-building"></select></label><label>階<input name="floor" placeholder="例：1階" maxlength="30" required></label><label>項目<select name="category"><option>照明</option><option>空調</option><option>給排水</option><option>防災</option><option>その他</option></select></label><label>設置日（不明なら空欄）<input name="installed" type="date" max="${today}"></label><label>採用周期（月・不明なら空欄）<input name="months" type="number" min="1" max="1200"></label><label>周期の根拠・メモ<input name="note" maxlength="500" placeholder="メーカー資料、社内の目安など"></label><button class="primary">設備を追加</button></form>`}`;
 if(!asset){const company=dialog.querySelector('#asset-entity'),building=dialog.querySelector('#asset-building'),fill=()=>{const values=entityProfiles.find(entity=>entity.id===company.value)?.buildings||[];building.innerHTML=values.length?values.map(item=>`<option>${esc(item.name)}</option>`).join(''):'<option>未設定のビル</option>';};company.onchange=fill;fill();}
 dialog.querySelector('#close').onclick=()=>dialog.close();
 dialog.querySelectorAll('form').forEach(form=>form.onsubmit=async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(form));
 if(Object.entries(data).some(([key,value])=>['name','floor','worker','note'].includes(key)&&form.elements[key].required&&!value.trim())) return;
 const button=form.querySelector('button');button.disabled=true;
 try{
 if(remoteSave){
 const operation={create:'asset.create',record:'asset.record',cycle:'asset.cycle'}[form.id];
 const payload=form.id==='create'?{...data,months:Number(data.months)}:form.id==='record'?{...data,id:asset.id}:{...data,id:asset.id,months:Number(data.months)};
 await remoteSave(operation,payload);
 }else{
 if(form.id==='create') assets.push({...data,id:crypto.randomUUID(),months:Number(data.months),history:[]});
 if(form.id==='record') asset.history.push({...data,recordedAt:new Date().toISOString()});
 if(form.id==='cycle'){asset.months=Number(data.months);asset.note=data.note;}
 persist();}
 dialog.close();renderEquipment();
 }catch(error){let message=dialog.querySelector('[role=alert]');if(!message){message=document.createElement('p');message.setAttribute('role','alert');dialog.append(message);}message.textContent=error.message;button.disabled=false;}
 });
 dialog.showModal();
}
export function getAssets(){return assets;}

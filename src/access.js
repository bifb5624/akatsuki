export const context={mode:'server',snapshot:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'content-type':'application/json','x-akatsuki-request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({error:'サーバーに接続できません。時間をおいてお試しください。'}));
 if(!response.ok){const error=new Error(data.error||data.message||'処理できませんでした。');error.status=response.status;throw error;}return data;
}
export async function apiFile(path,bytes){
 const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/pdf','x-akatsuki-request':'1'},body:bytes});
 const data=await response.json().catch(()=>({error:'Googleドライブの保存結果を確認できませんでした。'}));if(!response.ok)throw Error(data.error||'Googleドライブへ保存できませんでした。');return data;
}
export async function initializeAccess(){
 if(new URLSearchParams(location.search).get('demo')==='1'){context.mode='demo';return true;}
 const invitation=new URLSearchParams(location.hash.slice(1)).get('invite');
 if(invitation){history.replaceState(null,'',location.pathname);showAccess('invite',{token:invitation});return false;}
 try{const status=await api('/api/status');
 if(!status.initialized){showAccess('setup');return false;}
 try{context.snapshot=await api('/api/workspace');return true;}catch(error){if(error.status!==401)throw error;showAccess('login');return false;}
 }catch{showAccess('offline');return false;}
}
function frame(title,body){document.querySelector('#app').innerHTML=`<div class="access-shell"><div class="access-brand">◒ akatsuki<small>会社の予定と設備を、ひとつに。</small></div><section class="access-card"><p class="eyebrow">TEAM & BUILDING</p><h1>${title}</h1>${body}<p id="access-message" role="alert"></p></section><p class="access-note">この環境は開発・確認用です。会社向けの公開とバックアップ設定は準備中です。</p></div>`;}
function showAccess(mode,{token='',email=''}={}){
 if(mode==='offline'){frame('準備中です',`<p>共有用の保存機能に接続できません。画面の試作品は下から確認できます。</p><a class="button-link" href="?demo=1">仮のデータで画面を見る</a><button id="retry-access">接続を確認し直す</button>`);document.querySelector('#retry-access').onclick=()=>location.reload();return;}
 if(mode==='setup')frame('管理者の初期登録',`<p>最初の管理者を登録します。初期設定用の確認コードは運用担当者が管理します。</p><form id="access-form"><label>会社名<input name="company" required maxlength="100" autocomplete="organization"></label><label>管理者のお名前<input name="name" required maxlength="80" autocomplete="name"></label><label>メールアドレス<input name="email" type="email" required autocomplete="username"></label><label>パスワード（12文字以上）<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>初期設定用の確認コード<input name="token" type="password" required autocomplete="off"></label><button class="primary">管理者を登録する</button></form><a href="?demo=1">先に仮の画面を見る</a>`);
 if(mode==='login')frame('ログイン',`<p>会社から登録・招待されたメールアドレスでログインしてください。</p><form id="access-form"><label>メールアドレス<input name="email" type="email" required autocomplete="username" value="${esc(email)}"></label><label>パスワード<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">ログインする</button></form><p class="help-text">招待された方は、管理者から届いたリンクを開いて登録してください。</p><a href="?demo=1">仮のデータで画面を見る</a>`);
 if(mode==='invite')frame('招待から登録する',`<p>お名前とメールアドレスは管理者が登録済みです。ご自身でパスワードを決めてください。</p><form id="access-form"><label>パスワード（12文字以上）<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>もう一度入力<input name="confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button class="primary">登録する</button></form><p>リンクは48時間有効で、1回だけ利用できます。</p>`);
 document.querySelector('#access-form').onsubmit=async event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(event.target));const button=event.target.querySelector('button');button.disabled=true;const message=document.querySelector('#access-message');message.textContent='確認しています…';
 try{
 if(mode==='setup'){await api('/api/setup',data);showAccess('login',{email:data.email});document.querySelector('#access-message').textContent='管理者の登録が完了しました。ログインしてください。';}
 if(mode==='login'){await api('/api/auth/sign-in/email',data);await api('/api/workspace');location.reload();}
 if(mode==='invite'){if(data.password!==data.confirm)throw Error('パスワードが一致しません。');const result=await api('/api/invitations/accept',{token,password:data.password});token='';showAccess('login',{email:result.email});document.querySelector('#access-message').textContent='登録できました。ログインしてください。';}
 }catch(error){message.textContent=mode==='login'?'ログインできません。メールアドレスとパスワード、アカウントの利用状況を確認してください。':error.message;button.disabled=false;}
 };
}
export async function logout(){await api('/api/auth/sign-out',{});context.snapshot=null;location.assign('/');}

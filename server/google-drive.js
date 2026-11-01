import {createHash,randomBytes} from 'node:crypto';

const ROOT='https://www.googleapis.com';
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const mimeTypes=new Set(['application/pdf','image/jpeg','image/png']);
export class DriveConnectionError extends Error {
 constructor(message,{retryable=false,needsReconnect=false}={}){super(message);this.retryable=retryable;this.needsReconnect=needsReconnect;}
}
export function safeFileName(value){
 const name=String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f/\\]/g,'_').trim();
 if(!name||name==='.'||name==='..'||name.length>180)throw new Error('保存するファイル名を確認してください。');return name;
}
/** Server-side provider only. Connection authorization and encrypted token storage
 * must be implemented before exposing this through an application endpoint.
 * drive.file access supports app-created/explicitly selected files. It does NOT
 * grant automatic access to every receipt in an arbitrary existing folder.
 */
export class GoogleDriveFiles {
 constructor({getAccessToken,fetchImpl=fetch}){if(typeof getAccessToken!=='function')throw Error('A server-side token provider is required.');this.tokenProvider=getAccessToken;this.fetch=fetchImpl;}
 async request(url,options={}){
  for(let attempt=0;attempt<2;attempt++){
   const token=await this.tokenProvider({refresh:attempt===1});
   if(typeof token!=='string'||!token)throw new DriveConnectionError('Googleドライブに接続してください。',{needsReconnect:true});
   let response;
   try{response=await this.fetch(url,{...options,headers:{...options.headers,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30_000)});}catch{throw new DriveConnectionError('Googleドライブに接続できませんでした。時間をおいてお試しください。',{retryable:true});}
   if(response.status===401&&attempt===0)continue;
   if(response.status===401)throw new DriveConnectionError('Googleドライブへの接続が切れました。接続し直してください。',{needsReconnect:true});
   if(response.status===403)throw new DriveConnectionError('保存先のアクセス権、空き容量、Google側の利用制限を確認してください。');
   if(response.status===404)throw new DriveConnectionError('保存先が見つかりません。フォルダを選び直してください。');
   if(response.status===429||response.status>=500)throw new DriveConnectionError('Googleドライブが混み合っています。時間をおいて再度お試しください。',{retryable:true});
   if(!response.ok)throw new DriveConnectionError('Googleドライブへの保存に失敗しました。');
   const data=await response.json().catch(()=>{throw new DriveConnectionError('Googleドライブからの応答を確認できませんでした。',{retryable:true});});return data;
  }
 }
 async checkFolder(folderId){
  if(!identifier(folderId))throw Error('保存先フォルダを確認してください。');
  const data=await this.request(`${ROOT}/drive/v3/files/${folderId}?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
  if(data.trashed||data.mimeType!=='application/vnd.google-apps.folder'||!data.capabilities?.canAddChildren)throw new DriveConnectionError('このフォルダには保存できません。保存先を選び直してください。');return data;
 }
 async saveFile({folderId,exportId,name,mimeType,bytes}){
  if(!identifier(folderId)||!identifier(exportId))throw Error('保存先と保存処理の識別子を確認してください。');
  if(!mimeTypes.has(mimeType))throw Error('保存できる形式はPDF・JPEG・PNGです。');
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>20*1024*1024)throw Error('ファイルは20MB以下で指定してください。');
  const filename=safeFileName(name),checksum=createHash('sha256').update(bytes).digest('hex');
  await this.checkFolder(folderId);
  const query=new URLSearchParams({q:`'${folderId}' in parents and trashed = false and appProperties has { key='akatsukiExportId' and value='${exportId}' }`,fields:'files(id,name,appProperties)',pageSize:'2',includeItemsFromAllDrives:'true',supportsAllDrives:'true'});
  const existing=await this.request(`${ROOT}/drive/v3/files?${query}`);
  if(existing.files?.length){
   if(existing.files.length!==1||existing.files[0].appProperties?.sha256!==checksum)throw new DriveConnectionError('同じ保存処理に異なるファイルが見つかりました。保存履歴を確認してください。');
   return this.result(existing.files[0],true);
  }
  const metadata={name:filename,parents:[folderId],mimeType,appProperties:{akatsukiExportId:exportId,sha256:checksum}};
  const boundary=`akatsuki_${randomBytes(24).toString('hex')}`;
  const contentType=`multipart/related; boundary=${boundary}`;
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,bytes,`\r\n--${boundary}--\r\n`],{type:contentType});
  const saved=await this.request(`${ROOT}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`,{method:'POST',headers:{'content-type':contentType},body});
  return this.result(saved,false);
 }
 result(file,reused){if(!identifier(file.id))throw new DriveConnectionError('保存結果を確認できませんでした。',{retryable:true});return {id:file.id,name:file.name,url:`https://drive.google.com/file/d/${file.id}/view`,reused};}
}

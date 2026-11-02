import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN='https://oauth2.googleapis.com/token';
const USERINFO='https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE='https://oauth2.googleapis.com/revoke';
// Full Drive access is required for the opt-in inbox workflow: users place files
// in Drive themselves, then Akatsuki renames and moves those same files.
const SCOPES=['openid','email','https://www.googleapis.com/auth/drive'];
const key=value=>createHash('sha256').update(`akatsuki-google-v1\0${value}`).digest();

export function encryptTokens(tokens,dataKey){
 if(typeof dataKey!=='string'||dataKey.length<32)throw Error('APP_DATA_KEY must contain at least 32 characters.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(dataKey),iv);cipher.setAAD(Buffer.from('google-tokens-v1'));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function decryptTokens(value,dataKey){
 const [version,iv,tag,ciphertext,...extra]=String(value).split('.');
 if(version!=='v1'||extra.length||![iv,tag,ciphertext].every(Boolean))throw Error('保存済みのGoogle接続情報を読み取れません。');
 try{const decipher=createDecipheriv('aes-256-gcm',key(dataKey),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from('google-tokens-v1'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8'));}catch{throw Error('保存済みのGoogle接続情報を復号できません。接続し直してください。');}
}

export class GoogleOAuth{
 constructor({clientId,clientSecret,redirectUri,fetchImpl=fetch}){if(!clientId||!clientSecret)throw Error('Google OAuth client settings are incomplete.');this.clientId=clientId;this.clientSecret=clientSecret;this.redirectUri=redirectUri;this.fetch=fetchImpl;}
 authorizationUrl(state){const query=new URLSearchParams({client_id:this.clientId,redirect_uri:this.redirectUri,response_type:'code',scope:SCOPES.join(' '),access_type:'offline',prompt:'consent',state,include_granted_scopes:'true'});return `${AUTH}?${query}`;}
 async tokenRequest(values){let response;try{response=await this.fetch(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,client_id:this.clientId,client_secret:this.clientSecret}),signal:AbortSignal.timeout(30_000)});}catch{throw Error('Googleの認証サーバーへ接続できませんでした。');}const data=await response.json().catch(()=>({}));if(!response.ok||!data.access_token)throw Error('Google接続を完了できませんでした。もう一度接続してください。');return {...data,expires_at:Date.now()+Number(data.expires_in||3600)*1000};}
 async exchange(code){if(typeof code!=='string'||code.length<8||code.length>2048)throw Error('Googleから受け取った確認コードが不正です。');return this.tokenRequest({code,grant_type:'authorization_code',redirect_uri:this.redirectUri});}
 async refresh(refreshToken){if(!refreshToken)throw Error('Googleドライブを接続し直してください。');return this.tokenRequest({refresh_token:refreshToken,grant_type:'refresh_token'});}
 async email(accessToken){const response=await this.fetch(USERINFO,{headers:{authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(30_000)}).catch(()=>null);if(!response?.ok)throw Error('接続したGoogleアカウントを確認できませんでした。');const data=await response.json();if(!data.email||data.email_verified===false)throw Error('確認済みメールアドレスのあるGoogleアカウントを使用してください。');return data.email;}
 async revoke(token){if(!token)return false;const response=await this.fetch(`${REVOKE}?token=${encodeURIComponent(token)}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(30_000)}).catch(()=>null);return Boolean(response?.ok);}
}

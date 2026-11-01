import {createApplication} from './app.js';
import {runtimeConfig} from './config.js';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
process.umask(0o077);
const config=runtimeConfig();
const {dataDir,origin,port,host,trustProxyHops}=config;
await mkdir(dataDir,{recursive:true,mode:0o700});
async function retainedSecret(name,envValue){if(envValue)return envValue;const file=path.join(dataDir,name);try{return (await readFile(file,'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;const value=randomBytes(48).toString('base64url');await writeFile(file,value,{mode:0o600,flag:'wx'});return value;}}
const secret=await retainedSecret('auth-secret',process.env.APP_AUTH_SECRET);
const setupToken=await retainedSecret('setup-token',process.env.APP_SETUP_TOKEN);
const {app,close}=await createApplication({dataDir,origin,secret,setupToken,trustProxyHops,databaseUrl:process.env.TURSO_DATABASE_URL,databaseAuthToken:process.env.TURSO_AUTH_TOKEN});
const server=app.listen(port,host,()=>console.log('Akatsuki server is running. Credentials and setup codes are never printed.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{close();process.exit(0);}));

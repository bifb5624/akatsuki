import path from 'node:path';
export function runtimeConfig(env=process.env){
 const production=env.NODE_ENV==='production';
 const publicUrl=env.APP_ORIGIN||env.RENDER_EXTERNAL_URL||(env.RENDER_EXTERNAL_HOSTNAME?`https://${env.RENDER_EXTERNAL_HOSTNAME}`:undefined);
 if(production&&!publicUrl)throw Error('APP_ORIGIN must be configured for production.');
 if(Boolean(env.TURSO_DATABASE_URL)!==Boolean(env.TURSO_AUTH_TOKEN))throw Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.');
 if(production&&!env.TURSO_DATABASE_URL)throw Error('Production requires Turso so business data is not stored on an ephemeral disk.');
 const origin=new URL(publicUrl||'http://localhost:5173');
 if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('APP_ORIGIN must be a plain HTTP(S) origin without credentials or a path.');
 if(production&&origin.protocol!=='https:')throw Error('APP_ORIGIN must use HTTPS in production.');
 const port=Number(env.PORT||3001),trustProxyHops=Number(env.APP_TRUST_PROXY_HOPS||0);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer between 1 and 65535.');
 if(![0,1].includes(trustProxyHops))throw Error('APP_TRUST_PROXY_HOPS must be 0 (direct) or 1 (one trusted reverse proxy).');
 return {production,origin:origin.origin,port,trustProxyHops,host:env.APP_HOST||'127.0.0.1',dataDir:path.resolve(env.APP_DATA_DIR||'.local')};
}

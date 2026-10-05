import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {seal,digest,token,generateSecret} from '../lib/security.js';
process.loadEnvFile('.env.production.local');
fs.mkdirSync('private',{recursive:true,mode:0o700});
let keys;
if(fs.existsSync('private/keys.json')) keys=JSON.parse(fs.readFileSync('private/keys.json','utf8'));
else {keys={encryption:randomBytes(32).toString('base64'),activation:token(),runtimePassword:token()}; fs.writeFileSync('private/keys.json',JSON.stringify(keys),{mode:0o600});}
process.env.DATA_ENCRYPTION_KEY=keys.encryption;
const admin=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL}); await admin.connect();
try {
 await admin.query(fs.readFileSync('docs/schema.sql','utf8'));
 const exists=await admin.query('SELECT id FROM tracker_data WHERE id=1');
 if(!exists.rowCount) {
  const response=await fetch('http://127.0.0.1:4318/api/jobs'); if(!response.ok)throw new Error('Could not read local tracker.');
  const data=await response.json();
  await admin.query('INSERT INTO tracker_data(id,version,encrypted) VALUES(1,$1,$2)',[data.version,seal(data)]);
  console.log(`Imported ${data.jobs.length} applications as encrypted private data.`);
 }
 await admin.query("INSERT INTO tracker_owner(id,totp_encrypted,bootstrap_hash,bootstrap_expires) VALUES(1,$1,$2,now()+interval '48 hours') ON CONFLICT(id) DO NOTHING",[seal(generateSecret()),digest(keys.activation)]);
 const existingRole=await admin.query("SELECT rolname FROM pg_roles WHERE rolname='tracker_runtime'");
 if(!existingRole.rowCount) {const r=await admin.query("SELECT format('CREATE ROLE tracker_runtime LOGIN PASSWORD %L', $1::text) AS sql",[keys.runtimePassword]); await admin.query(r.rows[0].sql);}
 await admin.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO tracker_runtime;
 GRANT SELECT,UPDATE ON tracker_owner,tracker_data TO tracker_runtime;
 GRANT SELECT,INSERT,UPDATE,DELETE ON tracker_sessions,tracker_rate_limits TO tracker_runtime;
 GRANT SELECT,INSERT ON tracker_backups TO tracker_runtime;`);
 const connection=new URL(process.env.DATABASE_URL); connection.searchParams.set('sslmode','verify-full'); connection.username='tracker_runtime'; connection.password=keys.runtimePassword;
 const runtime={DATABASE_URL:connection.toString(),DATA_ENCRYPTION_KEY:keys.encryption,FRONTEND_ORIGIN:'https://thejhyefactor.github.io'};
 fs.writeFileSync('.env.runtime.local',Object.entries(runtime).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
 for(const [name,value] of Object.entries(runtime)) {
  const r=spawnSync('vercel',['env','add',name,'production','--force','--yes'],{input:value,encoding:'utf8'});
  if(r.status!==0)throw new Error(`Could not set ${name}: ${r.stderr}`);
  console.log(`Configured ${name} as a production environment variable.`);
 }
 // The activation capability stays on this Mac; no token enters Git or the published site.
 const link=`https://thejhyefactor.github.io/jhye-job-tracker/#activate=${keys.activation}`;
 fs.writeFileSync('private/Activate Job Tracker.command',`#!/bin/zsh\nopen '${link}'\n`,{mode:0o700});
 fs.chmodSync('.env.production.local',0o600);
 console.log('Private activation launcher created. Account stays locked until the owner sets credentials and MFA.');
} finally {await admin.end();}

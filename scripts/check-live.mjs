import fs from 'node:fs';
import pg from 'pg';
import assert from 'node:assert/strict';
import {digest,token,unseal,seal} from '../lib/security.js';
process.loadEnvFile('.env.production.local');
process.env.DATA_ENCRYPTION_KEY=JSON.parse(fs.readFileSync('private/keys.json')).encryption;
const adminURL=new URL(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL);adminURL.searchParams.set('sslmode','verify-full');
const admin=new pg.Client({connectionString:adminURL.toString()});await admin.connect();
const base='https://jhye-job-tracker-api.vercel.app',origin='https://thejhyefactor.github.io';
const checks=[];const secret=token();let fixtureId;
async function call(path,{auth=false,method='GET',body,site=origin}={}) {const headers={Origin:site}; if(auth)headers.Authorization=`Bearer ${secret}`;if(body)headers['Content-Type']='application/json';const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(`Unexpected non-JSON response: HTTP ${r.status}`);}return {status:r.status,headers:r.headers,data};}
try {
 const health=await call('/api/health');assert.equal(health.status,200);checks.push('Live API health');
 assert.equal((await call('/api/jobs')).status,401);checks.push('Anonymous jobs request denied');
 assert.equal((await call('/api/jobs',{site:'https://evil.example'})).status,403);checks.push('Foreign origin denied');
 assert.equal((await call('/api/setup/info',{method:'POST',body:{activation:token()}})).status,403);checks.push('Invalid activation denied');
 // A temporary operator-issued test session exercises the live data API without choosing owner credentials.
 await admin.query("INSERT INTO tracker_sessions(hash,expires_at) VALUES($1,now()+interval '5 minutes')",[digest(secret)]);
 const read=await call('/api/jobs',{auth:true});assert.equal(read.status,200);assert.equal(read.data.jobs.length,99);assert.equal(read.headers.get('cache-control'),'no-store');assert.equal(read.headers.get('x-frame-options'),'DENY');
 const johns=read.data.jobs.find(j=>/johns lyng/i.test(j.company));assert.equal(johns.stage,'Interview');const microsoft=read.data.jobs.find(j=>j.company==='Microsoft');assert.equal(microsoft.sourceStatus,'Viewed by employer');checks.push('Authenticated read: 99 migrated records including latest email updates');
 assert.equal((await call('/api/jobs',{auth:true,method:'POST',site:'https://evil.example',body:{}})).status,403);checks.push('Authenticated foreign-origin mutation denied');
 const title='Live verification '+token();
 const add=await call('/api/jobs',{auth:true,method:'POST',body:{version:read.data.version,job:{title,company:'Synthetic security verification',stage:'Applied',reviewStatus:'Not specified',advertStatus:'Not specified',date:'2026-10-05'}}});assert.equal(add.status,200);fixtureId=add.data.jobs.find(j=>j.title===title).id;
 const reread=await call('/api/jobs',{auth:true});assert.ok(reread.data.jobs.some(j=>j.id===fixtureId));
 const edit=await call('/api/jobs/'+fixtureId,{auth:true,method:'PATCH',body:{version:reread.data.version,job:{stage:'Interview'}}});assert.equal(edit.status,200);assert.equal(edit.data.jobs.find(j=>j.id===fixtureId).stage,'Interview');
 const stale=await call('/api/jobs/'+fixtureId,{auth:true,method:'PATCH',body:{version:reread.data.version,job:{stage:'Applied'}}});assert.equal(stale.status,409);checks.push('Live create/edit/read persistence and stale-write rejection');
 const backup=await admin.query('SELECT encrypted FROM tracker_backups WHERE version=$1',[read.data.version]);assert.equal(backup.rowCount,1);assert.equal(unseal(backup.rows[0].encrypted).jobs.length,99);checks.push('Encrypted server backup created');
 assert.equal((await call('/api/logout',{auth:true,method:'POST',body:{}})).status,200);assert.equal((await call('/api/jobs',{auth:true})).status,401);checks.push('Live logout revocation');
 const row=await admin.query('SELECT active FROM tracker_owner WHERE id=1');assert.equal(row.rows[0].active,false);checks.push('Owner account still awaits user credential and MFA activation');
 console.log(JSON.stringify({passed:checks},null,2));
}finally {
 await admin.query('DELETE FROM tracker_sessions WHERE hash=$1',[digest(secret)]);
 if(fixtureId) {
  await admin.query('BEGIN');
  const row=(await admin.query('SELECT version,encrypted FROM tracker_data WHERE id=1 FOR UPDATE')).rows[0]; const current=unseal(row.encrypted);
  current.jobs=current.jobs.filter(j=>j.id!==fixtureId);current.version+=1;
  await admin.query('UPDATE tracker_data SET version=$1,encrypted=$2 WHERE id=1',[current.version,seal(current)]);
  // QA-only snapshots contained the temporary record; keep real snapshots only.
  const snapshots=(await admin.query('SELECT version,encrypted FROM tracker_backups')).rows;
  for(const snapshot of snapshots) if(unseal(snapshot.encrypted).jobs.some(j=>j.id===fixtureId))await admin.query('DELETE FROM tracker_backups WHERE version=$1',[snapshot.version]);
  await admin.query('COMMIT');
 }
 await admin.end();
}

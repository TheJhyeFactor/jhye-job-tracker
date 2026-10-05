import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { db,transaction } from '../lib/db.js';
import { digest,token,seal,unseal,passwordHash,passwordMatches,otpStep,generateURI } from '../lib/security.js';
import { applyUpdate } from '../lib/jobs.js';
const origin=()=>process.env.FRONTEND_ORIGIN;
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function rate(key,limit,seconds) {
 const r=await db().query(`INSERT INTO tracker_rate_limits(key,hits,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN tracker_rate_limits.window_start < now()-($2 * interval '1 second') THEN 1 ELSE tracker_rate_limits.hits+1 END, window_start=CASE WHEN tracker_rate_limits.window_start < now()-($2 * interval '1 second') THEN now() ELSE tracker_rate_limits.window_start END RETURNING hits`,[key,seconds]);
 if(r.rows[0].hits>limit) throw fail(429,'Too many attempts. Wait 15 minutes and try again.');
}
async function readBody(req) {
 if(req.headers['content-type']?.split(';')[0]!=='application/json') throw fail(415,'Use JSON.');
 if(req.body !== undefined) {const size=Buffer.byteLength(JSON.stringify(req.body)); if(size>40000) throw fail(413,'Request too large.'); return typeof req.body==='string'?JSON.parse(req.body):req.body;}
 let raw=''; for await(const chunk of req){raw+=chunk; if(Buffer.byteLength(raw)>40000) throw fail(413,'Request too large.');} return JSON.parse(raw);
}
async function authenticated(req) {
 const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'');
 if(!match) throw fail(401,'Sign in to continue.');
 const hash=digest(match[1]);
 const r=await db().query("UPDATE tracker_sessions SET last_seen=now() WHERE hash=$1 AND expires_at>now() AND last_seen>now()-interval '30 minutes' RETURNING hash",[hash]);
 if(!r.rowCount) throw fail(401,'Your session expired. Sign in again.'); return hash;
}
async function session(c) {const value=token(); await c.query("DELETE FROM tracker_sessions WHERE expires_at<=now() OR last_seen<now()-interval '30 minutes'"); await c.query("INSERT INTO tracker_sessions(hash,expires_at) VALUES($1,now()+interval '12 hours')",[digest(value)]); return value;}
export default async function handler(req,res) {
 const send=(status,payload)=>{res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(payload));};
 res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"); res.setHeader('Strict-Transport-Security','max-age=31536000'); res.setHeader('Vary','Origin');
 const requestOrigin=req.headers.origin;
 if(requestOrigin && requestOrigin!==origin()) return send(403,{error:'This origin is not allowed.'});
 if(requestOrigin===origin()) {res.setHeader('Access-Control-Allow-Origin',origin()); res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
 const url=new URL(req.url,'https://localhost'); const path=url.pathname;
 if(req.method==='OPTIONS') {res.statusCode=204; return res.end();}
 if(path==='/api/health' && req.method==='GET') return send(200,{app:'jhye-job-tracker-api'});
 // Origins are an extra browser defence; all data routes independently require a secret session.
 if(['POST','PATCH'].includes(req.method) && requestOrigin!==origin()) return send(403,{error:'Use the tracker to make changes.'});
 try {
  const ip=digest(String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0]);
  if(['/api/setup/info','/api/setup','/api/login'].includes(path)) {
   if(req.method!=='POST') throw fail(405,'Method not allowed.');
   await rate(`auth-ip:${ip}`,20,900); await rate('auth-total',100,900);
   const input=await readBody(req);
   if(!input || typeof input!=='object' || Array.isArray(input)) throw fail(400,'Invalid request.');
   if(path.startsWith('/api/setup')) {
    if(typeof input.activation!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.activation)) throw fail(403,'Activation link is invalid or expired.');
    const hashed=digest(input.activation);
    if(path==='/api/setup/info') {
     const r=await db().query('SELECT totp_encrypted FROM tracker_owner WHERE id=1 AND active=false AND bootstrap_hash=$1 AND bootstrap_expires>now()',[hashed]);
     if(!r.rowCount) throw fail(403,'Activation link is invalid or expired.');
     const secret=unseal(r.rows[0].totp_encrypted);
     const uri=generateURI({issuer:'Jhye Job Tracker',label:'owner',secret});
     return send(200,{secret,qr:await QRCode.toDataURL(uri,{width:220})});
    }
    if(typeof input.username!=='string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(input.username)) throw fail(400,'Choose a username of 3–64 letters, numbers, dots, underscores or hyphens.');
    let hash; try {hash=await passwordHash(input.password);} catch(error) {throw fail(400,error.message);}
    const result=await transaction(async c=>{
     const r=await c.query('SELECT * FROM tracker_owner WHERE id=1 FOR UPDATE'); const owner=r.rows[0];
     if(!owner || owner.active || owner.bootstrap_hash!==hashed || new Date(owner.bootstrap_expires)<=new Date()) throw fail(403,'Activation link is invalid or expired.');
     const step=await otpStep(unseal(owner.totp_encrypted),input.otp);
     if(step===null) throw fail(401,'Authenticator code is incorrect.');
     const recovery=Array.from({length:10},()=>randomBytes(12).toString('hex'));
     await c.query('UPDATE tracker_owner SET active=true,username=$1,password_hash=$2,last_step=$3,recovery_hashes=$4,bootstrap_hash=NULL,bootstrap_expires=NULL WHERE id=1',[input.username.toLowerCase(),hash,step,JSON.stringify(recovery.map(digest))]);
     return {token:await session(c),recovery};
    });
    return send(200,result);
   }
   await rate('login-owner',10,900);
   const r=await db().query('SELECT * FROM tracker_owner WHERE id=1'); const owner=r.rows[0];
   if(!owner?.active || typeof input.username!=='string' || input.username.toLowerCase()!==owner.username || !(await passwordMatches(input.password,owner.password_hash))) throw fail(401,'Username, password or security code is incorrect.');
   const result=await transaction(async c=>{
    const r=await c.query('SELECT * FROM tracker_owner WHERE id=1 FOR UPDATE'); const current=r.rows[0];
    if(current.password_hash!==owner.password_hash) throw fail(401,'Sign in again.');
    const step=await otpStep(unseal(current.totp_encrypted),input.otp);
    const recoveryHash=typeof input.otp==='string' && /^[a-f0-9]{24}$/.test(input.otp)?digest(input.otp):null;
    const recoveryIndex=recoveryHash?current.recovery_hashes.indexOf(recoveryHash):-1;
    if(recoveryIndex>=0) {const codes=current.recovery_hashes.filter(h=>h!==recoveryHash); await c.query('UPDATE tracker_owner SET recovery_hashes=$1 WHERE id=1',[JSON.stringify(codes)]);}
    else {if(step===null || step<=Number(current.last_step)) throw fail(401,'Username, password or security code is incorrect.'); await c.query('UPDATE tracker_owner SET last_step=$1 WHERE id=1',[step]);}
    return {token:await session(c)};
   }); return send(200,result);
  }
  const sessionHash=await authenticated(req); await rate(`session:${sessionHash}`,300,60);
  if(path==='/api/logout' && req.method==='POST') {await db().query('DELETE FROM tracker_sessions WHERE hash=$1',[sessionHash]); return send(200,{ok:true});}
  if(path==='/api/jobs' && req.method==='GET') {
   const r=await db().query('SELECT encrypted FROM tracker_data WHERE id=1'); return send(200,unseal(r.rows[0].encrypted));
  }
  if((path==='/api/jobs' && req.method==='POST') || (path.startsWith('/api/jobs/') && req.method==='PATCH')) {
   const input=await readBody(req); if(!input || typeof input!=='object') throw fail(400,'Invalid application.');
   const result=await transaction(async c=>{
    const r=await c.query('SELECT version,encrypted FROM tracker_data WHERE id=1 FOR UPDATE'); const previous=r.rows[0]; const data=unseal(previous.encrypted);
    const changed=applyUpdate(data,input,req.method==='PATCH'?decodeURIComponent(path.slice('/api/jobs/'.length)):null);
    if(changed) {await c.query('INSERT INTO tracker_backups(version,encrypted) VALUES($1,$2)',[previous.version,previous.encrypted]); await c.query('UPDATE tracker_data SET version=$1,encrypted=$2 WHERE id=1',[data.version,seal(data)]);}
    return data;
   }); return send(200,result);
  }
  throw fail(404,'Not found.');
 } catch(error) {
  const status=error.status || (error instanceof SyntaxError ? 400 : 500);
  if(status===429) res.setHeader('Retry-After','900');
  if(status>=500) console.error('Tracker request failed',error.code || error.name);
  return send(status,{error:status>=500?'The service is temporarily unavailable. Try again.':error.message});
 }
}

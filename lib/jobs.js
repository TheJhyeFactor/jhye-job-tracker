import { randomUUID } from 'node:crypto';
export const stages = ['Applied','Employer site','Interview','Assessment','Recruiter review','Offer','Unlikely to progress','Rejected','Withdrawn'];
const fields = ['title','company','location','stage','date','salary','strongInterest','sourceStatus','sourceStatusDate','note','reviewStatus','advertStatus','nextAction','followUpDate','url','contact'];
export function cleanJob(input,previous={}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid application.');
  const job = {...previous};
  for (const key of fields) {
    if (!Object.hasOwn(input,key)) continue;
    if (key === 'strongInterest') {if(typeof input[key] !== 'boolean') throw new Error('Invalid interest value.'); job[key]=input[key];}
    else {if(typeof input[key] !== 'string' || input[key].length > (key==='note'?12000:1500)) throw new Error(`Invalid ${key}.`); job[key]=input[key].trim();}
  }
  if(!job.title || !job.company) throw new Error('Role and company are required.');
  if(!stages.includes(job.stage) || !['Not specified','Under active review','Shortlisted'].includes(job.reviewStatus) || !['Not specified','Open','Closed'].includes(job.advertStatus)) throw new Error('Invalid status.');
  for(const key of ['date','sourceStatusDate','followUpDate']) if(job[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(job[key]) || new Date(`${job[key]}T12:00:00Z`).toISOString().slice(0,10)!==job[key])) throw new Error(`Invalid ${key}.`);
  if(job.url) {const u=new URL(job.url); if(!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use a valid web link.');}
  return job;
}
export function applyUpdate(data,input,id) {
  if(!Number.isSafeInteger(input.version) || input.version!==data.version) throw Object.assign(new Error('Another window saved a change. Reload before editing.'),{status:409});
  const date=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});
  if(id) {
    const index=data.jobs.findIndex(j=>j.id===id);
    if(index<0) throw Object.assign(new Error('Application not found.'),{status:404});
    const old=data.jobs[index]; const job=cleanJob(input.job,old);
    const changed=fields.filter(k=>JSON.stringify(old[k]??'')!==JSON.stringify(job[k]??''));
    if(!changed.length) return false;
    job.latestUpdate=date; job.history=[...(old.history||[]),{date,text:changed.map(k=>k==='note'?'Notes updated':`${k}: ${job[k]||'cleared'}`).join(' · ')}];
    data.jobs[index]=job;
  } else {
    if(data.jobs.length>=2000) throw new Error('Application limit reached.');
    const job=cleanJob(input.job,{stage:'Applied',reviewStatus:'Not specified',advertStatus:'Not specified',strongInterest:false});
    if(data.jobs.some(j=>j.title.toLowerCase()===job.title.toLowerCase() && j.company.toLowerCase()===job.company.toLowerCase())) throw Object.assign(new Error('This application already exists.'),{status:409});
    Object.assign(job,{id:randomUUID(),latestUpdate:date,history:[{date,text:'Application added.'}]}); data.jobs.push(job);
  }
  data.version+=1; return true;
}

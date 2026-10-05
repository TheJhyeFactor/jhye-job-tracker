const API = 'https://jhye-job-tracker-api.vercel.app';
let sessionToken = null;
let activationToken = new URLSearchParams(location.hash.slice(1)).get('activate');
if (location.hash) history.replaceState(null,'',location.pathname+location.search);
if (window.top !== window.self) {document.body.replaceChildren(); throw new Error('Open the tracker in its own tab.');}
async function request(path,options={}) {
  const headers = {...options.headers};
  if (sessionToken) headers.Authorization=`Bearer ${sessionToken}`;
  const response = await fetch(API+path,{...options,headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(response.status===401 && sessionToken) {lock(); throw new Error('Your session expired. Sign in again.');}
  return response;
}
const stages = ['Applied','Employer site','Interview','Assessment','Recruiter review','Offer','Unlikely to progress','Rejected','Withdrawn'];
const reviews = ['Not specified','Under active review','Shortlisted'];
const adverts = ['Not specified','Open','Closed'];
const $ = id => document.getElementById(id);
const text = value => String(value ?? '');
const escape = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});
let state = {version:0,jobs:[]};
let filter = 'All';
let editingId = null;
const form = $('edit-form');
for (const [field, options] of [['stage',stages],['reviewStatus',reviews],['advertStatus',adverts]]) {
  form.elements[field].innerHTML = options.map(value => `<option>${escape(value)}</option>`).join('');
}
function due(job) { return !!job.followUpDate && job.followUpDate <= today() && !['Rejected','Withdrawn','Offer'].includes(job.stage); }
function render() {
  const counts = Object.fromEntries(stages.map(stage => [stage,state.jobs.filter(j => j.stage === stage).length]));
  $('stage-nav').innerHTML = ['All',...stages].map(stage => `<button type="button" data-stage="${escape(stage)}" class="${filter === stage ? 'active' : ''}" aria-pressed="${filter === stage}"><span>${stage === 'All' ? 'All applications' : escape(stage)}</span><span>${stage === 'All' ? state.jobs.length : counts[stage]}</span></button>`).join('');
  const cards = [
    ['Total tracked',state.jobs.length,'Applications & employer visits'],
    ['Applied',counts.Applied,'Awaiting outcomes'],
    ['Interviews',counts.Interview,'Next conversations'],
    ['Offers',counts.Offer,'Confirmed offers'],
    ['Follow-up due',state.jobs.filter(due).length,'Actions scheduled by you']
  ];
  $('stats').innerHTML = cards.map(([title,count,note]) => `<div class="stat"><span class="stat-title">${title}</span><strong>${count}</strong><small>${note}</small></div>`).join('');
  const query = $('search').value.trim().toLowerCase();
  const visible = state.jobs.filter(job => (filter === 'All' || job.stage === filter) && (!$('interest').checked || job.strongInterest) && (!$('due').checked || due(job)) && [job.title,job.company,job.location,job.note,job.nextAction,job.reviewStatus,job.advertStatus].some(value => text(value).toLowerCase().includes(query)));
  const sorting = $('sort').value;
  visible.sort((a,b) => sorting === 'company' ? a.company.localeCompare(b.company) : text(b[sorting === 'updated' ? 'latestUpdate' : 'date'] || b.date).localeCompare(text(a[sorting === 'updated' ? 'latestUpdate' : 'date'] || a.date)) || a.company.localeCompare(b.company));
  $('view-title').firstChild.textContent = filter === 'All' ? 'All applications ' : `${filter} `;
  $('result-count').textContent = visible.length;
  $('jobs').innerHTML = visible.map(job => {
    const kind = ({'Employer site':'employer','Unlikely to progress':'unlikely'})[job.stage] || job.stage.toLowerCase();
    const details = [job.reviewStatus !== 'Not specified' ? job.reviewStatus : '',job.advertStatus === 'Closed' ? 'Ad closed · outcome separate' : '',job.sourceStatus === 'Viewed by employer' ? `Viewed ${dateLabel(job.sourceStatusDate)}` : ''].filter(Boolean);
    return `<tr><td><span class="role">${escape(job.title)}${job.strongInterest ? '<span class="star" aria-label="Strong interest">★</span>' : ''}</span><span class="company">${escape(job.company)}</span></td><td class="location">${escape(job.location || 'Not recorded')}</td><td class="date">${dateLabel(job.date)}</td><td><span class="pill ${kind}">${escape(job.stage)}</span>${details.map(value=>`<span class="substatus">${escape(value)}</span>`).join('')}</td><td class="action">${escape(job.nextAction || '—')}${job.followUpDate ? `<span class="substatus ${due(job) ? 'overdue' : ''}">${due(job) ? 'Due ' : ''}${dateLabel(job.followUpDate)}</span>` : ''}</td><td><button class="edit" data-edit="${escape(job.id)}" aria-label="Edit ${escape(job.title)} at ${escape(job.company)}">Details ↗</button></td></tr>`;
  }).join('');
  $('empty').hidden = visible.length > 0;
  $('footer-count').textContent = `${visible.length} shown · ${state.jobs.length} total`;
}
async function load() {
  try {
    const response = await request('/api/jobs');
    if (!response.ok) throw new Error('Could not load applications.');
    state = await response.json();
    render();
    $('save-state').textContent = 'Saved to your account · encrypted backups enabled';
  } catch (error) {
    $('save-state').textContent = `${error.message} Try signing out and signing in again.`;
    $('add').disabled = true;
  }
}
function openEditor(id) {
  editingId = id;
  const job = id ? state.jobs.find(j => j.id === id) : {stage:'Applied',reviewStatus:'Not specified',advertStatus:'Not specified',date:today()};
  form.reset();
  for (const element of form.elements) {
    if (!element.name) continue;
    if (element.type === 'checkbox') element.checked = !!job[element.name];
    else element.value = job[element.name] || '';
  }
  $('editor-title').textContent = id ? 'Application details' : 'Add an application';
  $('form-error').textContent = '';
  $('source-info').textContent = id ? `${job.sourceStatus || (job.stage === 'Employer site' ? 'Employer website visit; submission unconfirmed.' : 'Imported from your saved application snapshot.')} ${job.sourceStatusDate ? `· ${dateLabel(job.sourceStatusDate)}` : ''}${job.latestUpdate ? ` · Last updated ${dateLabel(job.latestUpdate)}` : ''}` : 'Choose “Employer site” if you only visited the application site and have not confirmed submission.';
  const history = job.history || [];
  $('history').innerHTML = history.slice().reverse().map(item => `<li><b>${dateLabel(item.date)}</b> · ${escape(item.text)}</li>`).join('');
  $('history-section').hidden = !history.length;
  $('job-link').hidden = !job.url;
  if (job.url) $('job-link').href = job.url;
  else $('job-link').removeAttribute('href');
  $('editor').showModal();
}
form.addEventListener('submit',async event => {
  event.preventDefault();
  const job = {};
  for (const element of form.elements) {
    if (element.name) job[element.name] = element.type === 'checkbox' ? element.checked : element.value;
  }
  $('save').disabled = true;
  $('form-error').textContent = '';
  try {
    const response = await request(editingId ? `/api/jobs/${encodeURIComponent(editingId)}` : '/api/jobs', {method:editingId ? 'PATCH' : 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.version,job})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Save failed.');
    state = result;
    $('editor').close();
    render();
    $('save-state').textContent = `Saved to your account at ${new Date().toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'})}`;
  } catch (error) { $('form-error').textContent = error.message; }
  finally { $('save').disabled = false; }
});
$('stage-nav').addEventListener('click',event => {const button=event.target.closest('[data-stage]');if(button){filter=button.dataset.stage;render();}});
$('jobs').addEventListener('click',event => {const button=event.target.closest('[data-edit]');if(button)openEditor(button.dataset.edit);});
$('add').addEventListener('click',()=>openEditor(null));
for (const id of ['close-editor','cancel']) $(id).addEventListener('click',()=>$('editor').close());
for (const id of ['search','interest','due','sort']) $(id).addEventListener(id==='search'?'input':'change',render);
function downloadFile(content, name, type) {
 const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function download(format) {
 if(!sessionToken) return;
 const fields=['id','title','company','location','stage','date','salary','strongInterest','sourceStatus','sourceStatusDate','note','reviewStatus','advertStatus','nextAction','followUpDate','url','contact','latestUpdate'];
 const cell=value=>{let s=String(value??''); if(/^[=+@\-\t\r]/.test(s))s="'"+s; return `"${s.replaceAll('"','""')}"`;};
 const content=format==='json'?JSON.stringify(state,null,2):'\uFEFF'+[fields.join(','),...state.jobs.map(job=>fields.map(f=>cell(job[f])).join(','))].join('\r\n');
 downloadFile(content,`job-applications-${today()}.${format}`,format==='json'?'application/json':'text/csv');
}
$('export-json').addEventListener('click',()=>download('json'));
$('export-csv').addEventListener('click',()=>download('csv'));
function lock() {
 sessionToken=null; state={version:0,jobs:[]}; $('jobs').replaceChildren(); $('stats').replaceChildren(); $('history').replaceChildren();
 if($('editor').open)$('editor').close(); form.reset(); $('source-info').textContent=''; $('job-link').removeAttribute('href');
 $('workspace').hidden=true; $('auth-view').hidden=false; $('password').value=''; $('otp').value='';
}
async function unlock() {$('auth-view').hidden=true; $('workspace').hidden=false; $('add').disabled=false; await load();}
$('logout').addEventListener('click',async()=>{try{await request('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}finally{lock();}});
let recoveryCodes=[];
$('auth-form').addEventListener('submit',async event=>{
 event.preventDefault(); $('auth-submit').disabled=true; $('auth-error').textContent='';
 try {
  const input={username:$('username').value,password:$('password').value,otp:$('otp').value.trim()};
  if(activationToken)input.activation=activationToken;
  const response=await request(activationToken?'/api/setup':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const result=await response.json(); if(!response.ok)throw new Error(result.error||'Sign-in failed.');
  sessionToken=result.token; $('password').value=''; $('otp').value=''; activationToken=null; $('totp-key').value=''; $('qr').removeAttribute('src'); $('enrolment').hidden=true;
  if(result.recovery) {recoveryCodes=result.recovery; $('recovery-codes').textContent=recoveryCodes.join('\n'); $('auth-form').hidden=true; $('recovery-view').hidden=false;}
  else await unlock();
 }catch(error){$('auth-error').textContent=error.message;}
 finally{$('auth-submit').disabled=false;}
});
$('recovery-download').addEventListener('click',()=>downloadFile(`Jhye Job Tracker recovery codes\nUsername: ${$('username').value}\nEach code works once. Keep private.\n\n${recoveryCodes.join('\n')}\n`,'job-tracker-recovery-codes.txt','text/plain'));
$('recovery-continue').addEventListener('click',async()=>{
 recoveryCodes=[]; $('recovery-codes').textContent=''; $('recovery-view').hidden=true; $('auth-form').hidden=false;
 $('auth-title').textContent='Welcome back.'; $('auth-description').textContent='Sign in to manage your applications and next steps.'; $('auth-submit').textContent='Sign in'; $('password').autocomplete='current-password'; $('password').removeAttribute('minlength'); await unlock();
});
if(activationToken) {
 $('auth-title').textContent='Set up your account.'; $('auth-description').textContent='Choose your username and a unique password or passphrase of at least 16 characters.';
 $('auth-submit').textContent='Activate account'; $('password').autocomplete='new-password'; $('password').minLength=16;
 request('/api/setup/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activation:activationToken})}).then(async response=>{
  const result=await response.json(); if(!response.ok)throw new Error(result.error); $('totp-key').value=result.secret; $('qr').src=result.qr; $('enrolment').hidden=false;
 }).catch(error=>{$('auth-error').textContent=error.message; $('auth-submit').disabled=true;});
}

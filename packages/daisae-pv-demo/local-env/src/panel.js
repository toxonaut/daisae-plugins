import {App} from '@modelcontextprotocol/ext-apps';
const $=id=>document.getElementById(id);
const app=new App({name:'daisae-environment-variables',version:'1.0.0'},{availableDisplayModes:['fullscreen']},{autoResize:true});
let projects=[],projectId=null,rows=[],revision=null,dirty=false,busy=true,connected=false,pendingAction=null,initial=false,preferredDirectory=null;
const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const trash='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function controls(){for(const id of ['add','reload'])$(id).disabled=busy||!projectId;$('project').disabled=busy||!projects.length;for(const id of ['addFolder','refreshFolders','folderPath'])$(id).disabled=busy;$('save').disabled=busy||!projectId||!dirty;$('count').textContent=`(${rows.length})`;for(const el of $('rows').querySelectorAll('input,textarea,button'))el.disabled=busy;}
function changed(){dirty=true;status('Unsaved changes');controls();}
function render(){
 $('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.forEach((row,index)=>{
  const line=document.createElement('div');line.className='row';
  const name=document.createElement('input');name.value=row.name;name.placeholder='VARIABLE_NAME';name.setAttribute('aria-label',`Variable name ${index+1}`);name.autocomplete='off';name.spellcheck=false;
  name.oninput=()=>{row.name=name.value;changed();};
  const wrap=document.createElement('div');wrap.className='value';
  let value=document.createElement('input');value.type='password';value.value=row.value;value.placeholder='Enter a value';value.autocomplete='new-password';value.spellcheck=false;value.setAttribute('aria-label',`Value ${index+1}`);
  // Preserve existing multiline values unless the user explicitly replaces them.
  value.oninput=()=>{row.value=value.value;row.assigned=true;changed();};
  const reveal=document.createElement('button');reveal.className='icon';reveal.innerHTML=eye;reveal.setAttribute('aria-label',`Show value ${index+1}`);reveal.setAttribute('aria-pressed','false');reveal.title='Show value';
  reveal.onclick=()=>{const show=reveal.getAttribute('aria-pressed')!=='true';const replacement=document.createElement(show&&row.value.includes('\n')?'textarea':'input');if(replacement.tagName==='INPUT')replacement.type=show?'text':'password';replacement.value=row.value;replacement.setAttribute('aria-label',`Value ${index+1}`);replacement.autocomplete='off';replacement.spellcheck=false;replacement.oninput=()=>{row.value=replacement.value;row.assigned=true;changed();};value.replaceWith(replacement);value=replacement;reveal.setAttribute('aria-pressed',String(show));reveal.setAttribute('aria-label',`${show?'Hide':'Show'} value ${index+1}`);reveal.title=show?'Hide value':'Show value';};
  const remove=document.createElement('button');remove.className='icon danger';remove.innerHTML=trash;remove.setAttribute('aria-label',`Remove variable ${index+1}`);remove.title='Remove variable';remove.onclick=()=>{rows.splice(index,1);changed();render();};
  wrap.append(value,reveal);line.append(name,wrap,remove);$('rows').append(line);
 });controls();
}
async function call(name,args){const r=await app.callServerTool({name,arguments:args});if(r.isError)throw new Error(r.content?.[0]?.text||'Local request failed.');return r;}
async function load(id){busy=true;controls();status('Loading .env…');try{const r=await call('read_project_environment',{projectId:id,projectDirectory:projects.find(p=>p.id===id)?.directory});const d=r._meta;if(!d?.rows)throw new Error('The host did not deliver the private editor data.');projectId=id;rows=d.rows;revision=d.revision;dirty=Boolean(d.needsEncryption);$('project').value=id;$('path').textContent=projects.find(p=>p.id===id).directory+'/.env';status(d.needsEncryption?'Plain-text values found. Save to encrypt them.':d.exists?'Loaded from disk':'No .env file yet. Save to create it.');}catch(e){status(e.message,true);}finally{busy=false;render();}}
function confirmDiscard(fn){if(!dirty)return fn();pendingAction=fn;$('discard').hidden=false;}
$('cancelDiscard').onclick=()=>{pendingAction=null;$('discard').hidden=true;};
$('confirmDiscard').onclick=()=>{const fn=pendingAction;pendingAction=null;$('discard').hidden=true;fn?.();};
$('add').onclick=()=>{rows.push({name:'',value:'',assigned:true});changed();render();$('rows').lastElementChild?.querySelector('input').focus();};
$('reload').onclick=()=>confirmDiscard(()=>load(projectId));
$('project').onchange=()=>{const id=$('project').value;$('project').value=projectId||'';if(!id)return;confirmDiscard(()=>load(id));};
$('save').onclick=async()=>{
 const names=rows.map(r=>r.name);if(names.some(n=>! /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))||new Set(names).size!==names.length){status('Use unique names with letters, numbers and underscores; start with a letter or underscore.',true);return;}
 busy=true;controls();status('Saving .env…');try{const r=await call('save_project_environment',{projectId,projectDirectory:projects.find(p=>p.id===projectId)?.directory,revision,rows});if(!r._meta?.revision)throw new Error('Save response was incomplete. Reload to verify.');rows=r._meta.rows;revision=r._meta.revision;dirty=false;status('Saved encrypted values to .env');}catch(e){status(e.message,true);}finally{busy=false;render();}
};
async function populate(result){
 projects=result._meta?.projects||[];preferredDirectory=result._meta?.preferredDirectory||null;projectId=null;rows=[];revision=null;dirty=false;initial=true;$('path').textContent='—';await start();
}
async function refreshFolders(path){busy=true;controls();try{const r=await call('list_environment_projects',path?{projectDirectory:path}:{});await populate(r);$('folderPath').value='';}catch(e){status(e.message,true);}finally{busy=false;controls();}}
$('addFolder').onclick=()=>confirmDiscard(()=>refreshFolders($('folderPath').value.trim()));
$('refreshFolders').onclick=()=>confirmDiscard(()=>refreshFolders());
async function start(){
 if(!connected||!initial)return;
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a project folder…';
 $('project').replaceChildren(placeholder,...projects.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.directory;return o;}));
 busy=false;render();
 const preferred=projects.find(p=>p.directory===preferredDirectory);
 if(preferred)await load(preferred.id);else status(projects.length?'Choose the folder whose environment variables you want to edit.':'Add a project folder using its absolute path.');
}
app.ontoolresult=r=>{if(r._meta?.projects)confirmDiscard(()=>populate(r));};
function theme(context){if(context?.theme==='dark'||context?.theme==='light')document.documentElement.dataset.theme=context.theme;}
app.onhostcontextchanged=theme;
try{await app.connect();theme(app.getHostContext());connected=true;await start();const c=app.getHostContext();if(c?.displayMode==='inline'&&c.availableDisplayModes?.includes('fullscreen'))await app.requestDisplayMode({mode:'fullscreen'});}catch{status('Could not connect to the local MCP host.',true);}

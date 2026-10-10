import {App} from '@modelcontextprotocol/ext-apps';
import {tasks} from './tasks.js';
const app=new App({name:'daisae-workspace',version:'2.6.9'},{availableDisplayModes:['fullscreen']},{autoResize:true});
const $=id=>document.getElementById(id);
let connected=false,busy=false;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function fallback(task,text){$('prompt').value=task.prompt;$('fallback').hidden=false;$('fallback-title').textContent=text;$('prompt').focus();$('prompt').select();}
function theme(context){if(context?.theme==='dark'||context?.theme==='light')document.documentElement.dataset.theme=context.theme;}
async function launch(task){
 if(busy)return;
 $('fallback').hidden=true;
 if(!connected||!app.getHostCapabilities()?.message){fallback(task,'Copy this starter prompt into a chat to begin.');status('Starter prompt ready.');return;}
 busy=true;document.querySelectorAll('.card').forEach(button=>button.disabled=true);status('Starting '+task.title+'…');
 try{
  const extended=Boolean(app.getHostCapabilities()?.experimental?.['openai/message']);
  const params={role:'user',content:[{type:'text',text:task.prompt}]};
  if(extended)params._meta={'openai/message':{target:'new',send:true}};
  const result=await app.sendMessage(params);
  if(result.isError)throw new Error('The host rejected this starter prompt.');
  status(extended?'Started in a new chat.':'Starter prompt sent to this chat.');
 }catch{
  // Never automatically retry: a timeout may follow a successfully sent prompt.
  fallback(task,'The task launch could not be confirmed. Check your chats before copying this prompt to begin.');status('Task launch could not be confirmed.',true);
 }finally{busy=false;document.querySelectorAll('.card').forEach(button=>button.disabled=false);}
}
for(const task of tasks){
 const button=document.createElement('button');button.type='button';button.className='card';button.style.setProperty('--accent',task.color);
 const top=document.createElement('span');top.className='card-top';top.setAttribute('aria-hidden','true');top.innerHTML='<svg class="task-icon" viewBox="0 0 24 24">'+task.icon+'</svg><svg class="arrow" viewBox="0 0 24 24"><path d="M6 18 18 6M6 6h12v12"/></svg>';
 const title=document.createElement('span');title.className='card-title';title.textContent=task.title;
 const description=document.createElement('span');description.className='description';description.textContent=task.description;
 button.append(top,title,description);button.onclick=()=>void launch(task);$('tasks').append(button);
}
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('prompt').value);status('Prompt copied.');}catch{$('prompt').focus();$('prompt').select();status('Select and copy the prompt above.');}};
app.onhostcontextchanged=theme;
if(window.parent===window){status('Preview · choose a card to view its starter prompt.');}
else{try{await app.connect();connected=true;theme(app.getHostContext());const context=app.getHostContext();if(context?.displayMode==='inline'&&context.availableDisplayModes?.includes('fullscreen'))await app.requestDisplayMode({mode:'fullscreen'});}catch{status('Choose a card to copy its starter prompt.');}}

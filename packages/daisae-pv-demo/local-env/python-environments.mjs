import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {join,isAbsolute,dirname} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {pythonCommand} from './runtime.mjs';

const config=JSON.parse(await readFile(new URL('./python-environments.json',import.meta.url),'utf8'));
export const environmentDefaults=config;
export function environmentRoot(){
 const value=process.env.DAISAE_PYTHON_HOME;
 if(value&&!isAbsolute(value))throw Error('DAISAE_PYTHON_HOME must be an absolute path.');
 return value||join(process.platform==='win32'?(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local')):process.platform==='darwin'?join(homedir(),'Library','Application Support'):join(homedir(),'.local','share'),'DAISAE','python');
}
function name(value='main'){if(!/^[a-z][a-z0-9-]{0,39}$/.test(value))throw Error('Environment names must use lowercase letters, numbers and hyphens, beginning with a letter.');return value;}
const slot=id=>join(environmentRoot(),'environments',name(id));
async function checkSlot(id){for(const path of [join(environmentRoot(),'environments'),slot(id),join(slot(id),'.venv')]){try{if((await lstat(path)).isSymbolicLink())throw Error('DAISAE environment directories must not be symbolic links.');}catch(e){if(e.code!=='ENOENT')throw e;}}}
export const environmentPython=id=>join(slot(id),'.venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
const uvExecutable=()=>join(environmentRoot(),'tools','uv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'uv.exe':'uv');
function installerEnv(){
 // Project secrets and Python/pip overrides must not affect package installers/build hooks.
 const out={};
 for(const key of ['PATH','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY'])if(process.env[key])out[key]=process.env[key];
 return {...out,UV_PYTHON_INSTALL_DIR:join(environmentRoot(),'runtimes'),UV_CACHE_DIR:join(environmentRoot(),'cache'),UV_PYTHON_BIN_DIR:join(environmentRoot(),'bin'),UV_NO_MODIFY_PATH:'1',UV_NATIVE_TLS:'true',UV_NO_PROGRESS:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1'};
}
export async function runProcess(command,args,{timeout=900000,env=installerEnv(),cwd}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env,cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='',error='',expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill();setTimeout(()=>child.kill('SIGKILL'),2000).unref();},timeout);
  child.stdout.on('data',c=>{output=(output+c).slice(-1000000);});child.stderr.on('data',c=>{error=(error+c).slice(-12000);});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Could not start the environment installer or interpreter.'));});
  child.on('close',code=>{clearTimeout(timer);if(expired)return reject(Error('Environment operation timed out. Retry the install to repair it.'));if(code!==0)return reject(Error(`Environment operation failed (exit ${code}). ${error.replace(/https?:\/\/[^\s]+/g,'[URL]').slice(-3000)}`));resolve(output);});
 });
}
async function withLock(id,fn){
 const root=environmentRoot();await mkdir(join(root,'locks'),{recursive:true,mode:0o700});const lock=join(root,'locks',id+'.lock');
 for(let i=0;;i++){
  try{await mkdir(lock);await writeFile(join(lock,'owner'),String(process.pid));break;}
  catch(e){if(e.code!=='EEXIST')throw e;let pid;try{pid=Number(await readFile(join(lock,'owner'),'utf8'));}catch{}
   if(pid){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){await rm(lock,{recursive:true,force:true});continue;}}}
   if(i>=300)throw Error('Another DAISAE environment operation is running. Retry after it finishes.');await new Promise(r=>setTimeout(r,100));
  }
 }
 try{return await fn();}finally{await rm(lock,{recursive:true,force:true});}
}
async function metadata(id){try{return JSON.parse(await readFile(join(slot(id),'environment.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(id,value){const dest=join(slot(id),'environment.json'),temp=dest+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,dest);}
async function uv(){return withLock('installer',async()=>{
 const executable=uvExecutable();try{await runProcess(executable,['--version'],{timeout:10000});return executable;}catch{}
 const base=await pythonCommand();const target=join(environmentRoot(),'tools','uv');
 await mkdir(dirname(target),{recursive:true});
 await runProcess(base.command,[...base.args,'-m','venv',target]);
 const python=join(target,process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
 await runProcess(python,['-m','pip','install','--index-url','https://pypi.org/simple',`uv==${config.uvVersion}`]);
 await runProcess(executable,['--version'],{timeout:10000});return executable;
 });}
async function inspect(python){return JSON.parse(await runProcess(python,['-I','-c','import sys,json;print(json.dumps({"version":".".join(map(str,sys.version_info[:3])),"executable":sys.executable,"prefix":sys.prefix,"basePrefix":sys.base_prefix}))'],{timeout:10000}));}
async function inventory(python){return JSON.parse(await runProcess(python,['-I','-c','import json,importlib.metadata as m;print(json.dumps(sorted([{"name":d.metadata["Name"],"version":d.version} for d in m.distributions()],key=lambda d:d["name"].lower())))'],{timeout:10000}));}
function packages(values){if(!Array.isArray(values)||values.length>100||values.some(v=>typeof v!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:[<>=!~]+[A-Za-z0-9.*+_-]+(?:,[<>=!~]+[A-Za-z0-9.*+_-]+)*)?$/.test(v)))throw Error('Use package names with optional version constraints; URLs and installer flags are not accepted as packages.');return [...new Set(values)];}
export async function installEnvironment({environment='main',pythonVersion,includeDefaults=true,extraPackages=[]}={}){
 const id=name(environment);await checkSlot(id);if(pythonVersion&&!/^3\.(?:9|1[0-9])(?:\.\d+)?$/.test(pythonVersion))throw Error('Specify a Python 3 version, e.g. 3.11 or 3.10.16.');
 const requested=packages([...(includeDefaults?config.defaultPackages:[]),...extraPackages]);
 return withLock(`environment-${id}`,async()=>{
  const old=await metadata(id);if(old&&old.owner!=='daisae-python-v1')throw Error('This directory is not a DAISAE-managed environment.');
  const manager=await uv();const base=await pythonCommand();const system=await inspect(base.command).catch(async()=>JSON.parse(await runProcess(base.command,[...base.args,'-I','-c','import sys,json;print(json.dumps({"version":".".join(map(str,sys.version_info[:3]))}))'])));
  const target=pythonVersion||old?.pythonVersion||system.version;
  if(old&&!(old.pythonVersion===target||old.pythonVersion.startsWith(target+'.')))throw Error('This environment uses another Python version. Create a separately named environment.');
  await mkdir(slot(id),{recursive:true,mode:0o700});
  const python=environmentPython(id);let reused=false;try{const info=await inspect(python);if(await realpath(info.prefix)!==await realpath(join(slot(id),'.venv')))throw Error('Invalid environment prefix');reused=true;}catch{try{await lstat(join(slot(id),'.venv'));throw Error('The existing .venv is incomplete or invalid. Explicitly uninstall this environment and install it again.');}catch(e){if(e.code!=='ENOENT')throw e;}}
  let record={...old,owner:'daisae-python-v1',environment:id,pythonVersion:target,status:'installing',packages:old?.packages||[],frameworks:old?.frameworks||{},createdAt:old?.createdAt||new Date().toISOString()};await save(id,record);
  try{
   if(!reused){let interpreter;
    if(system.version===target||system.version.startsWith(target+'.'))interpreter=system.executable||base.command;
    else{await runProcess(manager,['python','install',target]);interpreter=(await runProcess(manager,['python','find','--managed-python',target])).trim();}
    await runProcess(manager,['venv','--seed','--python',interpreter,join(slot(id),'.venv')]);
   }
   if(requested.length)await runProcess(manager,['pip','install','--python',python,'--index-url','https://pypi.org/simple',...requested]);
   await runProcess(manager,['pip','check','--python',python]);const info=await inspect(python);
   record={...record,status:'ready',pythonVersion:info.version,installedPackages:await inventory(python),packages:[...new Set([...record.packages,...requested])],updatedAt:new Date().toISOString()};await save(id,record);
   return {...record,python,venv:join(slot(id),'.venv'),reused};
  }catch(e){await save(id,{...record,status:'needs_repair'});throw e;}
 });
}
export async function listEnvironments(){
 let entries=[];try{entries=await readdir(join(environmentRoot(),'environments'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const environments=[];for(const id of entries){if(!/^[a-z][a-z0-9-]{0,39}$/.test(id))continue;const entry=await metadata(id);if(entry?.owner==='daisae-python-v1')environments.push({...entry,python:environmentPython(id),venv:join(slot(id),'.venv')});}
 return {root:environmentRoot(),defaultEnvironment:config.defaultEnvironment,defaultPackages:config.defaultPackages,frameworks:config.frameworks,environments};
}
export async function uninstallEnvironment({environment}={}){
 if(!environment)throw Error('Specify the environment to uninstall.');
 const id=name(environment);await checkSlot(id);return withLock(`environment-${id}`,async()=>{
  const entry=await metadata(id);if(!entry)return {environment:id,removed:false};
  if(entry.owner!=='daisae-python-v1'||(await lstat(slot(id))).isSymbolicLink())throw Error('Refusing to remove an unmanaged or linked directory.');
  await rm(slot(id),{recursive:true});return {environment:id,removed:true,projectsPreserved:true,credentialsPreserved:true};
 });
}
export async function applicationPython(environment=process.env.DAISAE_PYTHON_ENVIRONMENT||config.defaultEnvironment){
 if(process.env.DAISAE_ENV_PYTHON)return pythonCommand();
 await checkSlot(name(environment));const entry=await metadata(name(environment));if(entry?.status!=='ready')throw Error(`DAISAE environment ${environment} is not ready. Run install_python_environment first.`);
 const command=environmentPython(environment);const info=await inspect(command);if(await realpath(info.prefix)!==await realpath(join(slot(environment),'.venv')))throw Error('The managed interpreter points outside its environment. Reinstall this environment.');return {command,args:[]};
}
export async function installFramework({environment='main',framework='forkscope',source}={}){
 const id=name(environment);await checkSlot(id);if(framework!=='forkscope')throw Error('Only the Forkscope framework profile is currently supported.');
 source=source||config.frameworks.forkscope.source;
 if(!source)throw Error('Provide the verified Forkscope repository URL or absolute local package path. No Forkscope source is configured.');
 if(!isAbsolute(source)&&!/^git\+https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_./@#=-]+$/.test(source))throw Error('Use an absolute local package path or a git+https repository URL, preferably pinned to a commit.');
 if(isAbsolute(source))source=await realpath(source);
 return withLock(`environment-${id}`,async()=>{
  const entry=await metadata(id);if(entry?.status!=='ready')throw Error('Install the selected Python environment before adding Forkscope.');
  const manager=await uv(),python=environmentPython(id);
  await save(id,{...entry,status:'installing'});
  try{
   await runProcess(manager,['pip','install','--python',python,source]);await runProcess(manager,['pip','check','--python',python]);
   const updated={...entry,status:'ready',installedPackages:await inventory(python),frameworks:{...entry.frameworks,[framework]:{source,installedAt:new Date().toISOString()}},updatedAt:new Date().toISOString()};await save(id,updated);return {...updated,python};
  }catch(e){await save(id,{...entry,status:'needs_repair'});throw e;}
 });
}

import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,chmod,writeFile,readFile,rm,symlink,cp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {environmentRoot,installEnvironment,listEnvironments,uninstallEnvironment,installFramework,applicationPython,runProcess} from './python-environments.mjs';
import {secureStore} from './secure-store.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const originalRoot=environmentRoot(),root=await mkdtemp(join(tmpdir(),'daisae-python-test-'));
process.env.DAISAE_PYTHON_HOME=root;
const client=new Client({name:'python-environment-tests',version:'1.0'});
const uvFolder=process.platform==='win32'?'Scripts':'bin',uvFile=process.platform==='win32'?'uv.exe':'uv';
async function launch(launcher,project){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[launcher,'--project',project,'--','-c','import os,sys,json; assert os.environ["SYNTHETIC_ONLY"]=="project-secret"; print(json.dumps({"prefix":sys.prefix,"version":list(sys.version_info[:2])}))'],{env:process.env,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(JSON.parse(out)));
 });}
try{
 await cp(join(originalRoot,'cache'),join(root,'cache'),{recursive:true});
 const toolDir=join(root,'tools','uv',uvFolder);await mkdir(toolDir,{recursive:true});await copyFile(join(originalRoot,'tools','uv',uvFolder,uvFile),join(toolDir,uvFile));await chmod(join(toolDir,uvFile),0o755);
 const first=await installEnvironment({includeDefaults:false});assert.equal(first.environment,'main');assert.equal(first.reused,false);
 const reused=await installEnvironment({includeDefaults:false});assert.equal(reused.reused,true);assert.equal(first.python,reused.python);
 await assert.rejects(installEnvironment({environment:'../escape',includeDefaults:false}));await assert.rejects(installEnvironment({pythonVersion:'3.10',includeDefaults:false}),/another Python version/);
 await assert.rejects(uninstallEnvironment(),/Specify/);assert.ok((await listEnvironments()).frameworks.forkscope.source.startsWith('git+https://github.com/alonso130r/forkscope.git@'));
 for(const projectName of ['project a','project b']){
  const project=join(root,projectName);await mkdir(project);const initial=await secureStore({action:'read',directory:project});await secureStore({action:'save',directory:project,revision:initial.revision,rows:[{name:'SYNTHETIC_ONLY',assigned:true,value:'project-secret'}]});
  const disk=await readFile(join(project,'.env'),'utf8');assert.ok(!disk.includes('project-secret'));
  const result=await launch(fileURLToPath(new URL('./run-python.mjs',import.meta.url)),project);assert.equal(await realpath(result.prefix),await realpath(first.venv));assert.equal(await readFile(join(project,'.env'),'utf8'),disk);
 }
 const freshPlugin=join(root,'plugin-reinstalled');await mkdir(freshPlugin);
 for(const file of ['run-python.mjs','python-environments.mjs','python-environments.json','runtime.mjs','secure-store.mjs','credentials.py','file_lock.py','store.py','vendor'])await cp(fileURLToPath(new URL(file,import.meta.url)),join(freshPlugin,file),{recursive:true});
 const reinstalled=await launch(join(freshPlugin,'run-python.mjs'),join(root,'project a'));assert.equal(await realpath(reinstalled.prefix),await realpath(first.venv));
 // An installable test fixture verifies repository/path installation mechanics; it is not real Forkscope.
 const fixture=join(root,'framework-fixture');await mkdir(fixture);await writeFile(join(fixture,'pyproject.toml'),'[build-system]\nrequires=["setuptools>=65"]\nbuild-backend="setuptools.build_meta"\n[project]\nname="daisae-framework-test-fixture"\nversion="0.0.1"\n');await writeFile(join(fixture,'fixture_module.py'),'VALUE=42\n');
 await installFramework({source:fixture});assert.equal((await runProcess(first.python,['-c','import fixture_module;print(fixture_module.VALUE)'])).trim(),'42');
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url))],env:{...process.env},stderr:'pipe'}));
 const tools=(await client.listTools()).tools;assert.ok(tools.find(t=>t.name==='uninstall_python_environment').annotations.destructiveHint);
 const started=await client.callTool({name:'install_python_environment',arguments:{environment:'mcp-test',includeDefaults:false}});assert.equal(started.structuredContent.status,'running');
 let operation;
 for(let i=0;i<120;i++){operation=await client.callTool({name:'get_python_environment_operation',arguments:{operationId:started.structuredContent.operationId}});if(operation.structuredContent.status!=='running')break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(operation.structuredContent.status,'complete',JSON.stringify(operation));
 const removed=await client.callTool({name:'uninstall_python_environment',arguments:{environment:'mcp-test'}});assert.equal(removed.structuredContent.removed,true);
 assert.equal((await listEnvironments()).environments.length,1);
 await uninstallEnvironment({environment:'main'});assert.equal((await listEnvironments()).environments.length,0);assert.ok((await readFile(join(root,'project a','.env'),'utf8')).includes('DAISAE_ENC:'));
 console.log('PASS: real .venv creation/reuse, version isolation, two projects with encrypted startup variables, reinstall reuse, framework-package installation fixture, async MCP install/status/uninstall, deletion isolation, and preserved project credentials.');
}finally{await client.close();await rm(root,{recursive:true,force:true});process.env.DAISAE_PYTHON_HOME=originalRoot;}

import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ListRootsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const server=fileURLToPath(new URL('server.mjs',import.meta.url));
const cwd=await mkdtemp(join(tmpdir(),'daisae-project-cwd-'));
const override=await mkdtemp(join(tmpdir(),'daisae-project-override-'));
const root=await mkdtemp(join(tmpdir(),'daisae-project-root-'));
const bindings=new Map();
async function check({configured,roots,expected,projectDirectory}){
 const client=new Client({name:'project-discovery-test',version:'1'},roots?{capabilities:{roots:{}}}:{});
 if(roots)client.setRequestHandler(ListRootsRequestSchema,async()=>({roots}));
 const env={...process.env};delete env.DAISAE_ENV_PROJECT_DIR;
 if(configured)env.DAISAE_ENV_PROJECT_DIR=configured;
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd,env,stderr:'pipe'}));
  if(projectDirectory&&bindings.has(projectDirectory)){
   const restored=await client.callTool({name:'read_project_environment',arguments:{projectId:bindings.get(projectDirectory),projectDirectory}});
   assert.notEqual(restored.isError,true);
   const wrong=await client.callTool({name:'read_project_environment',arguments:{projectId:bindings.get(projectDirectory),projectDirectory:root}});
   assert.equal(wrong.isError,true);
  }
  const result=await client.callTool({name:'open_environment_variables',arguments:projectDirectory?{projectDirectory}:{}});
  if(!expected){assert.deepEqual(result._meta.projects,[]);return;}
  assert.equal(result._meta.projects[0].directory,await realpath(expected));
  if(projectDirectory){if(bindings.has(projectDirectory))assert.equal(result._meta.projects[0].id,bindings.get(projectDirectory));bindings.set(projectDirectory,result._meta.projects[0].id);}
  const again=await client.callTool({name:'open_environment_variables',arguments:projectDirectory?{projectDirectory}:{}});
  assert.equal(again._meta.projects[0].id,result._meta.projects[0].id);
 }finally{await client.close();}
}
try{
 await check({});
 await check({projectDirectory:cwd,expected:cwd});
 await check({configured:override});
 await check({projectDirectory:override,expected:override});
 await check({configured:override,roots:[{uri:pathToFileURL(root).href,name:'Current project'}],expected:root});
 await check({roots:[]});
 await check({projectDirectory:cwd,roots:[{uri:pathToFileURL(root).href}],expected:cwd});
 console.log('PASS: chat directory binding, different project directories, host roots, explicit chat precedence, no plugin cwd fallback, restart recovery, mismatched folder rejection, and stable project IDs.');
}finally{await Promise.all([cwd,override,root].map(path=>rm(path,{recursive:true,force:true})));}

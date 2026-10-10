import {readFile,writeFile,mkdir,rename,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
const directory=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'daisae','downloads');
export async function rememberDownload(value){await mkdir(directory,{recursive:true,mode:0o700});const file=join(directory,value.artifact_id+'.json'),tmp=file+'.'+randomUUID();await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,file);}
export async function downloadStatus(artifact){try{const value=JSON.parse(await readFile(join(directory,artifact.artifact_id+'.json'),'utf8'));const stat=await lstat(value.path);return {status:stat.isFile()&&!stat.isSymbolicLink()&&stat.size===value.size_bytes?'downloaded':'changed',path:value.path};}catch(e){return {status:e.code==='ENOENT'?'untracked':'unavailable'};}}

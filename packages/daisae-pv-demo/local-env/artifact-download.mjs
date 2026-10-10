import {rememberDownload} from './download-history.mjs';
import {mkdir,realpath,lstat,open,unlink,rename} from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
export async function downloadArtifact({artifact_id,download_url,projectDirectory,filename,sha256,overwrite=false}){
 if(!path.isAbsolute(projectDirectory))throw Error('Supply the current project’s absolute local directory');
 const url=new URL(download_url);
 if(url.origin!=='https://pv-mcp-production.up.railway.app'||url.pathname!=='/python-artifacts/'+artifact_id||!url.searchParams.get('ticket'))throw Error('Use a fresh DAISAE artifact download link');
 const project=await realpath(projectDirectory);const dir=path.join(project,'artifacts');await mkdir(dir,{recursive:true});
 if((await lstat(dir)).isSymbolicLink()||await realpath(dir)!==dir)throw Error('The artifacts directory must be inside the selected project, without symlinks');
 let name=path.basename(filename).replace(/[^\p{L}\p{N}_. -]/gu,'_');if(!name||name==='.'||name==='..')name=artifact_id;
 let destination=path.join(dir,name),file;const temporary=overwrite?path.join(dir,'.download-'+randomUUID()):null;
 for(let i=0;i<100;i++){
  try{file=await open(temporary||destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);break;}catch(e){if(e.code!=='EEXIST'||overwrite)throw e;const ext=path.extname(name);destination=path.join(dir,path.basename(name,ext)+'_'+artifact_id.slice(0,8)+(i?'_'+i:'')+ext);}
 }
 if(!file)throw Error('Could not allocate a download filename');let complete=false;
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Download link expired or unavailable. Refresh it with get_python_artifact');
  const hash=createHash('sha256');let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>100*1024**2)throw Error('Artifact exceeds 100 MB');hash.update(chunk);let offset=0;while(offset<chunk.length){const {bytesWritten}=await file.write(chunk,offset,chunk.length-offset);if(!bytesWritten)throw Error('Download write failed');offset+=bytesWritten;}}
  const digest=hash.digest('hex');if(sha256&&digest!==sha256)throw Error('Artifact checksum verification failed');await file.sync();if(temporary)await rename(temporary,destination);complete=true;
  const result={artifact_id,path:destination,projectDirectory:project,size_bytes:size,sha256:digest,remote_original_preserved:true};await rememberDownload(result).catch(()=>{});return result;
 }finally{await file.close();if(!complete)await unlink(temporary||destination).catch(()=>{});}
}

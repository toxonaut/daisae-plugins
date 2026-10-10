import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {downloadArtifact} from './artifact-download.mjs';
const remote='https://pv-mcp-production.up.railway.app';
export const bridgeOrigin='https://'+createHash('sha256').update(remote+'/mcp').digest('hex').slice(0,32)+'.claudemcpcontent.com';
export function startDownloadBridge({port=41387,download=downloadArtifact,fetchMetadata=async url=>{
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Download link expired or unavailable. Refresh the artifact list and retry');return response.json();
}}={}){
 const allowed=new Set([bridgeOrigin,'null',`http://127.0.0.1:${port}`]);
 const server=createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,`http://127.0.0.1:${port}`);
  if(req.method==='GET'&&requestUrl.pathname==='/download'){
   const candidate=requestUrl.searchParams.get('artifact');
   try{const u=new URL(candidate);if(u.origin!==remote||!/^\/python-artifacts\/[0-9a-f-]{36}$/.test(u.pathname)||!u.searchParams.get('ticket'))throw Error();}catch{res.writeHead(400).end('Invalid DAISAE artifact link');return;}
   const payload=JSON.stringify(candidate).replace(/</g,'\\u003c');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"}).end(`<!doctype html><html><head><title>Save DAISAE artifact</title><style>body{font:16px system-ui;margin:60px auto;max-width:700px;padding:24px;color:#183451}p{overflow-wrap:anywhere}button{padding:10px;font:inherit}</style></head><body><h1>Download to project</h1><p id="status" role="status">Saving your artifact…</p><p id="path"></p><button id="retry" hidden>Retry</button><p>You can close this page after the file is saved.</p><script>const link=${payload};async function save(){document.getElementById('retry').hidden=true;try{const r=await fetch('/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({download_url:link})});const result=await r.json();if(!r.ok)throw Error(result.error);document.getElementById('status').textContent='Saved to project. Checksum verified.';document.getElementById('path').textContent=result.path;}catch(e){document.getElementById('status').textContent=e.message;document.getElementById('retry').hidden=false;}}document.getElementById('retry').onclick=save;save();</script></body></html>`);return;
  }
  const origin=req.headers.origin;
  if(!allowed.has(origin)){res.writeHead(403).end();return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(data));};
  if(req.method!=='POST'||req.url!=='/download'||!req.headers['content-type']?.startsWith('application/json'))return json(400,{error:'Invalid request'});
  try{
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('Request too large');}
   const args=JSON.parse(body);const url=new URL(args.download_url);
   if(url.origin!==remote||!/^\/python-artifacts\/[0-9a-f-]{36}$/.test(url.pathname)||!url.searchParams.get('ticket'))throw Error('Only signed DAISAE artifact links are accepted');
   const metadataUrl=new URL(url);metadataUrl.searchParams.set('metadata','1');
   // Destination/name/checksum come from authenticated HTTPS metadata, never from the browser request.
   const artifact=await fetchMetadata(metadataUrl);
   if(url.pathname!=='/python-artifacts/'+artifact.artifact_id)throw Error('Artifact identity mismatch');
   if(!artifact.projectFolder||!path.isAbsolute(artifact.projectFolder))throw Error('This artifact needs an existing local project folder before it can be downloaded to project');
   const result=await download({artifact_id:artifact.artifact_id,download_url:url.href,projectDirectory:artifact.projectFolder,filename:artifact.kind==='dataset'?artifact.name+'.parquet':artifact.filename||artifact.name,sha256:artifact.sha256,overwrite:false});
   json(200,result);
  }catch(error){json(400,{error:error.message});}
 });
 // A second local MCP process may already own the bridge; reuse that listener.
 server.on('error',error=>{if(error.code!=='EADDRINUSE')console.error('DAISAE download bridge unavailable:',error.code);});
 server.listen(port,'127.0.0.1');return server;
}

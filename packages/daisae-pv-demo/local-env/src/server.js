import {startDownloadBridge} from '../download-bridge.mjs';
import {downloadArtifact} from '../artifact-download.mjs';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {registerAppResource,registerAppTool,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isAbsolute} from 'node:path';
import {secureStore as store,nativeKey} from '../secure-store.mjs';
import {knownFolders,existingFolders,rememberFolder} from '../project-folders.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {installEnvironment,listEnvironments,uninstallEnvironment,installFramework} from '../python-environments.mjs';
const base=new URL('./',import.meta.url),uri='ui://daisae/environment-variables-v2.html';
const html=await readFile(new URL('panel.html',base),'utf8');
const icon='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33"><rect x="3" y="8" width="14" height="10" rx="2"/><path d="M6 8V5a4 4 0 0 1 8 0v3M10 12v3"/></svg>').toString('base64');
const panelMode=process.env.DAISAE_LOCAL_PANEL||'all';
const menuPythonIcon='data:image/svg+xml;base64,'+Buffer.from(await readFile(new URL('../assets/python.svg',base),'utf8')).toString('base64');
const server=new McpServer({name:panelMode==='explorer'?'daisae-local-dataset-explorer':'daisae-local-environment',version:'1.2.0',icons:[{src:panelMode==='python'?menuPythonIcon:panelMode==='explorer'?'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16M2 12h16M8 7v10"/></svg>').toString('base64'):icon,mimeType:'image/svg+xml'}]});
const pythonUri='ui://daisae/python-environments-v2.html';
const pythonHtml=await readFile(new URL('python-panel.html',base),'utf8');
const pythonIcon='data:image/svg+xml;base64,'+Buffer.from(await readFile(new URL('../assets/python.svg',base),'utf8')).toString('base64');
const projects=new Map();
const projectPath=z.string().refine(isAbsolute,'Project directory must be an absolute path');
function projectKey(directory){const h=createHash('sha256').update(directory).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
async function discover(projectDirectory){
 let dirs=projectDirectory?[projectDirectory]:[];
 if(!dirs.length&&server.server.getClientCapabilities()?.roots){
  try{dirs=(await server.server.listRoots({}, {timeout:3000})).roots.filter(r=>r.uri.startsWith('file://')).map(r=>fileURLToPath(r.uri));}catch{}
 }
 const discovered=await existingFolders([...dirs,...await knownFolders()]);
 for(const resolved of discovered)projects.set(projectKey(resolved),resolved);
 return discovered.map(directory=>({id:projectKey(directory),directory}));
}
const safe=fn=>async args=>{try{return await fn(args);}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}};
const meta={ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{availableDisplayModes:['fullscreen'],preferredDisplayMode:'fullscreen'}};
// Dataset explorer is served by the remote DAISAE connection; local tools do not authenticate separately.
if(panelMode!=='python'&&panelMode!=='explorer'){
startDownloadBridge();
server.registerTool('download_python_artifact_to_project',{title:'Download artifact to project',description:'Save a remote DAISAE artifact in the current local project artifacts folder. First get fresh metadata from get_python_artifact; pass its artifact_id, download_url, sha256 and filename. Supply the current chat absolute projectDirectory, using the registered projectFolder when it is the intended local project. Keeps the remote original. Existing files get a unique filename unless overwrite was explicitly requested.',inputSchema:{artifact_id:z.string().uuid(),download_url:z.string().url(),projectDirectory:projectPath,filename:z.string().min(1).max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),overwrite:z.boolean().default(false)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},safe(async args=>{const data=await downloadArtifact(args);return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}));
registerAppResource(server,'environment-panel',uri,{_meta:meta},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:html,_meta:meta}]}));
registerAppTool(server,'open_environment_variables',{
 title:'Environment variables',description:'Open the local project .env editor for the current chat. Supply projectDirectory from the current chat working directory. Values are masked in the UI and excluded from model-visible results. Saving encrypts values in the displayed project folder. Use the bundled run-python.mjs launcher to decrypt them for Python.',inputSchema:{projectDirectory:projectPath.optional().describe('Absolute working directory of the current chat. Always supply the current chat project directory when opening from a chat; never use the plugin directory or a fixed project path.')},annotations:{readOnlyHint:true,openWorldHint:false},
 _meta:{ui:{resourceUri:uri},'openai/outputTemplate':uri,'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}}
},safe(async({projectDirectory})=>({content:[{type:'text',text:'Environment variables editor ready. Select the project folder in the panel.'}],structuredContent:{local:true},_meta:{projects:await discover(projectDirectory),preferredDirectory:projectDirectory||null}})));
const appMeta={ui:{resourceUri:uri,visibility:['app']},'openai/widgetAccessible':true};
registerAppTool(server,'list_environment_projects',{
 title:'Find project folders',description:'UI-only: list existing known local project folders, optionally adding a folder entered by the user.',inputSchema:{projectDirectory:projectPath.optional()},annotations:{readOnlyHint:true,openWorldHint:false},_meta:appMeta
},safe(async({projectDirectory})=>{if(projectDirectory&&!(await existingFolders([projectDirectory])).length)throw new Error('That folder does not exist. Enter an existing absolute folder path.');return {content:[],structuredContent:{local:true},_meta:{projects:await discover(projectDirectory),preferredDirectory:projectDirectory||null}};}));
async function directory(id,projectDirectory){
 if(projectDirectory){const resolved=await realpath(projectDirectory);if(projectKey(resolved)!==id)throw new Error('Project folder does not match the selected project. Reopen the editor.');projects.set(id,resolved);}
 const dir=projects.get(id);if(!dir)throw new Error('Project selection expired. Use this chat’s project to reopen the editor.');return dir;
}
registerAppTool(server,'read_project_environment',{
 title:'Load project environment',description:'UI-only: read the selected local project .env. Values are delivered only to the panel.',inputSchema:{projectDirectory:projectPath.optional(),projectId:z.string().uuid()},annotations:{readOnlyHint:true,openWorldHint:false},_meta:appMeta
},safe(async({projectId,projectDirectory})=>{const dir=await directory(projectId,projectDirectory);const data=await store({action:'read',directory:dir});await rememberFolder(dir).catch(()=>{});return {content:[],structuredContent:{count:data.rows.length},_meta:{...data,projectId}};}));
registerAppTool(server,'save_project_environment',{
 title:'Save project environment',description:'UI-only: save the user-edited variables in the selected project .env, encrypting all assigned values and preserving comments. Requires the revision loaded by the panel.',inputSchema:{projectDirectory:projectPath.optional(),projectId:z.string().uuid(),revision:z.string().length(64),rows:z.array(z.object({name:z.string().max(200),value:z.string().max(65536),assigned:z.boolean()})).max(500)},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},_meta:appMeta
},safe(async({projectId,projectDirectory,revision,rows})=>{const data=await store({action:'save',directory:await directory(projectId,projectDirectory),revision,rows});return {content:[],structuredContent:{saved:true,count:data.rows.length},_meta:{...data,projectId}};}));
}
if(panelMode!=='environment'&&panelMode!=='explorer'){
registerAppResource(server,'python-environments-panel',pythonUri,{_meta:meta},async()=>({contents:[{uri:pythonUri,mimeType:RESOURCE_MIME_TYPE,text:pythonHtml,_meta:meta}]}));
registerAppTool(server,'open_python_environments',{title:'Python environments',description:'Open the local and remote Python environments manager to install, inspect and remove shared environments, select Python versions, and install Forkscope.',icons:[{src:pythonIcon,mimeType:'image/svg+xml'}],inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false},_meta:{ui:{resourceUri:pythonUri},'openai/outputTemplate':pythonUri,'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}}},safe(async()=>result(await listEnvironments())));
const pythonAppMeta={ui:{resourceUri:pythonUri},'openai/widgetAccessible':true};
registerAppTool(server,'inspect_remote_python_environment',{_meta:pythonAppMeta,title:'Remote Python environment',description:'Inspect the Railway worker Python version and installed package inventory.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:true}},safe(async()=>{
 const response=await fetch('https://pv-mcp-production.up.railway.app/python-environment',{signal:AbortSignal.timeout(45000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Remote environment unavailable.');return result(data);
}));
const operations=new Map();
function startOperation(fn){const operationId=randomUUID();const job={operationId,status:'running',startedAt:new Date().toISOString()};operations.set(operationId,job);Promise.resolve().then(fn).then(value=>Object.assign(job,{status:'complete',result:value}),error=>Object.assign(job,{status:'failed',message:error.message}));return result(job);}
const environmentName=z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).default('main');
const result=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
registerAppTool(server,'list_python_environments',{_meta:pythonAppMeta,title:'Python environments',description:'Show DAISAE shared Python environments, versions, default packages and framework installations. Environments survive plugin uninstall/reinstall.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},safe(async()=>result(await listEnvironments())));
registerAppTool(server,'install_python_environment',{_meta:pythonAppMeta,title:'Install Python environment',description:'Create or repair a persistent shared DAISAE .venv outside the plugin directory. main defaults to the system Python version. Named environments can use different Python versions; missing versions are downloaded with uv. Installs the listed default research packages and optional additional packages. Reuses existing environments; never replaces the Python version of an existing environment. Returns an operation ID immediately; check get_python_environment_operation until complete. No project .env variables are passed to installers.',inputSchema:{environment:environmentName,pythonVersion:z.string().optional(),includeDefaults:z.boolean().default(true),extraPackages:z.array(z.string()).max(100).default([])},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},safe(async args=>startOperation(()=>installEnvironment(args))));
registerAppTool(server,'uninstall_python_environment',{_meta:pythonAppMeta,title:'Uninstall Python environment',description:'Explicitly remove the selected DAISAE-managed shared environment and its packages. Only use when the user requests removal. Preserves projects, encrypted variables, credential keys, other environments and reusable Python runtimes. Plugin removal does not call this tool.',inputSchema:{environment:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}},safe(async args=>result(await uninstallEnvironment(args))));
registerAppTool(server,'install_python_framework',{_meta:pythonAppMeta,title:'Install Forkscope',description:'Install Forkscope into an existing DAISAE environment (main by default) from the user-provided verified repository or local installable package. Source must be an absolute local path or git+https repository URL, preferably pinned to a commit. Check Forkscope Python requirements before installing; use a separately named environment if incompatible. Returns an operation ID; check get_python_environment_operation until complete. No repository is assumed.',inputSchema:{environment:environmentName,framework:z.literal('forkscope').default('forkscope'),source:z.string().optional()},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},safe(async args=>startOperation(()=>installFramework(args))));
registerAppTool(server,'get_python_environment_operation',{_meta:pythonAppMeta,title:'Python setup progress',description:'Check an install operation returned by install_python_environment or install_python_framework. Wait for complete before running Python; failed includes the reason. Operation IDs last for this local MCP session.',inputSchema:{operationId:z.string().uuid()},annotations:{readOnlyHint:true,openWorldHint:false}},safe(async({operationId})=>{const operation=operations.get(operationId);if(!operation)throw Error('Operation is no longer in this session. Inspect list_python_environments and retry setup if needed.');return result(operation);}));
}
// Start provisioning automatically, without blocking MCP discovery on an OS prompt.
// Tools retry credential access independently if startup access is denied.
void nativeKey(true).then(key=>key.fill(0)).catch(()=>{});
await server.connect(new StdioServerTransport());

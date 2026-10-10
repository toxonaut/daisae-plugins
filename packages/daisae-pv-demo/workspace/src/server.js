import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {registerAppResource,registerAppTool,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {readFile} from 'node:fs/promises';
const uri='ui://daisae/workspace-v2.6.8.html';
const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
const svg=await readFile(new URL('../assets/daisy.svg',import.meta.url),'utf8');
const icons=[{src:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),mimeType:'image/svg+xml',sizes:['any']}];
const server=new McpServer({name:'daisae-workspace',version:'2.6.8',icons});
const meta={ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{availableDisplayModes:['fullscreen'],preferredDisplayMode:'fullscreen'}};
registerAppResource(server,'daisae-workspace',uri,{_meta:meta},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:html,_meta:meta}]}));
registerAppTool(server,'open_daisae_workspace',{
  title:'DAISAE Workbench',
  description:'Open DAISAE Workbench to choose starter tasks for LSMV queries, literature searches and analysis, knowledge bases, Forkscope, and MedDRA mapping.',
  inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  _meta:{ui:{resourceUri:uri},'openai/iconStyle':'monochrome','openai/outputTemplate':uri,'openai/ui':{entrypoints:[{type:'global'}]}}
},async()=>({content:[{type:'text',text:'DAISAE Workbench is ready. Choose a starter task.'}],structuredContent:{ready:true,version:'2.6.8'},_meta:{'openai/outputTemplate':uri}}));
await server.connect(new StdioServerTransport());

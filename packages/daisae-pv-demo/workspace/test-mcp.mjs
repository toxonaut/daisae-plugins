import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'workspace-verification',version:'1'});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[process.env.WORKSPACE_MCP_SERVER||new URL('./server.mjs',import.meta.url).pathname],stderr:'pipe'}));
 const tools=(await client.listTools()).tools;
 assert.equal(tools.length,1);
 const tool=tools[0];assert.equal(tool.name,'open_daisae_workspace');assert.equal(tool.title,'DAISAE Workbench');
 assert.deepEqual(tool._meta['openai/ui'].entrypoints,[{type:'global'}]);
 assert.ok(Buffer.from(client.getServerVersion().icons[0].src.split(',')[1],'base64').toString().includes('currentColor'));
 const opened=await client.callTool({name:tool.name,arguments:{}});assert.equal(opened.structuredContent.ready,true);assert.equal(opened.isError,undefined);
 const resource=await client.readResource({uri:tool._meta.ui.resourceUri});
 assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');
 assert.deepEqual(resource.contents[0]._meta['openai/ui'].availableDisplayModes,['fullscreen']);
 const html=resource.contents[0].text;assert.ok(html.includes('Discover starter tasks for your research area.'));
 for(const title of ['Make a LSMV Query','Make a literature search','Analyze literature set','Search knowledge bases','Use Forkscope','Map Meddra'])assert.ok(html.includes(title));
 assert.ok(!html.includes('<!--APP_SCRIPT-->'));assert.ok(!html.includes('<!--DAISY-->'));
 console.log('PASS: installed workspace startup, global entrypoint, daisy icon, empty-argument opener, bundled HTML, display metadata and all six tasks.');
}finally{await client.close();}

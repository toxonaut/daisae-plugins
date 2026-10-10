import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('./',import.meta.url);
await build({entryPoints:[new URL('src/server.js',base).pathname],bundle:true,platform:'node',format:'esm',target:'node20',outfile:new URL('server.mjs',base).pathname,banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});
const ui=await build({entryPoints:[new URL('src/workspace.js',base).pathname],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,minify:true});
const template=await readFile(new URL('src/workspace.html',base),'utf8');
const daisy=await readFile(new URL('../assets/daisy.svg',base),'utf8');
await writeFile(new URL('workspace.html',base),template.replace('<!--DAISY-->',()=>daisy).replace('<!--APP_SCRIPT-->',()=>'<script type="module">'+ui.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>'));

import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url);
await build({entryPoints:[new URL('src/server.js',dir).pathname],bundle:true,platform:'node',format:'esm',target:'node20',outfile:new URL('server.mjs',dir).pathname,banner:{js:"import {createRequire} from 'node:module'; const require = createRequire(import.meta.url);"}});
const ui=await build({entryPoints:[new URL('src/panel.js',dir).pathname],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,minify:true});
const template=await readFile(new URL('src/panel.html',dir),'utf8');
await writeFile(new URL('panel.html',dir),template.replace('<!--APP_SCRIPT-->',()=>'<script type="module">'+ui.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>'));

const pythonUI=await build({entryPoints:[new URL('src/python-panel.js',dir).pathname],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,minify:true});
const pythonTemplate=await readFile(new URL('src/python-panel.html',dir),'utf8');
const pythonLogo=await readFile(new URL('../assets/python.svg',dir),'utf8');
await writeFile(new URL('python-panel.html',dir),pythonTemplate.replace('<!--PYTHON_LOGO-->',()=>pythonLogo).replace('<!--APP_SCRIPT-->',()=>'<script type="module">'+pythonUI.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>'));

const dataset=await readFile(new URL('../../../public/table.html',dir),'utf8');
await writeFile(new URL('dataset-panel.html',dir),dataset.replace('<script type="module">','<script>window.__localExplorer=true;</script><script type="module">'));

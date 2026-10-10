import {readFile,realpath,stat,mkdir,writeFile,rename} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
const home=process.env.CODEX_HOME||join(homedir(),'.codex');
const historyFile=join(home,'daisae','environment-projects.json');
export async function knownFolders(){
 let remembered=[],configured=[];
 try{const data=JSON.parse(await readFile(historyFile,'utf8'));if(Array.isArray(data))remembered=data.filter(p=>typeof p==='string');}catch{}
 // Read only project table headings; never expose settings or credential values.
 try{const config=await readFile(join(home,'config.toml'),'utf8');for(const match of config.matchAll(/^\s*\[projects\.("(?:[^"\\]|\\.)*"|'[^']*')\]\s*(?:#.*)?$/gm)){try{configured.push(match[1][0]==='"'?JSON.parse(match[1]):match[1].slice(1,-1));}catch{}}}catch{}
 return [...remembered,...configured.reverse()];
}
export async function existingFolders(candidates){const result=[];for(const p of candidates){if(typeof p!=='string'||!isAbsolute(p))continue;try{const dir=await realpath(p);if((await stat(dir)).isDirectory()&&!result.includes(dir))result.push(dir);}catch{}}return result;}
export async function rememberFolder(directory){
 const previous=await knownFolders();const folders=await existingFolders([directory,...previous]);
 await mkdir(join(home,'daisae'),{recursive:true,mode:0o700});const temp=historyFile+'.'+randomUUID();
 await writeFile(temp,JSON.stringify(folders.slice(0,100)),{mode:0o600});await rename(temp,historyFile);
}

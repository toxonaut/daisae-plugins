#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import {secureStore} from './secure-store.mjs';
import {applicationPython} from './python-environments.mjs';
import {dirname,delimiter} from 'node:path';

const args = process.argv.slice(2);
let selectedEnvironment;
const selectedIndex=args.indexOf('--environment');
if(selectedIndex>=0&&selectedIndex<args.indexOf('--')){selectedEnvironment=args[selectedIndex+1];args.splice(selectedIndex,2);}
if (args[0] !== '--project' || !args[1] || args[2] !== '--' || args.length < 4) {
  console.error('Usage: node run-python.mjs --project <project-folder> [--environment <name>] -- <script.py | -m module | -c code> [arguments]');
  process.exitCode = 2;
} else {
  try {
    const directory = await realpath(args[1]);
    const data = await secureStore({action: 'read', directory});
    const env = {...process.env};
    const existing = new Set(Object.keys(env).map(name => process.platform === 'win32' ? name.toUpperCase() : name));
    for (const row of data.rows) {
      const name = process.platform === 'win32' ? row.name.toUpperCase() : row.name;
      // Match dotenv's default: explicit inherited env takes precedence.
      if (row.assigned && !existing.has(name)) {env[row.name] = row.value; existing.add(name);}
    }
    const {command, args: prefix} = await applicationPython(selectedEnvironment);
    if(!process.env.DAISAE_ENV_PYTHON){env.VIRTUAL_ENV=dirname(dirname(command));env.PATH=dirname(command)+delimiter+(env.PATH||'');env.PYTHONNOUSERSITE='1';delete env.PYTHONHOME;}
    const child = spawn(command, [...prefix, ...args.slice(3)], {cwd: directory, env, stdio: 'inherit'});
    const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => {
      const handler = () => child.kill(signal);
      process.on(signal, handler);
      return [signal, handler];
    }));
    child.on('error', () => {console.error('Could not launch Python.'); process.exitCode = 1;});
    child.on('close', (code, signal) => {
      for (const [name, handler] of handlers) process.off(name, handler);
      process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

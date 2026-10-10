// Native macOS/Windows integration. Uses the single real DAISAE credential,
// which is intentionally retained, and only synthetic values in temporary files.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeKey, secureStore} from './secure-store.mjs';
import {pythonCommand} from './runtime.mjs';
const first = await nativeKey(true);
const concurrent = await Promise.all([nativeKey(true), nativeKey(true), nativeKey(false)]);
for (const key of concurrent) {assert.ok(first.equals(key)); key.fill(0);}
first.fill(0);
const directory = await mkdtemp(join(tmpdir(), 'daisae native test '));
const originalLauncher = fileURLToPath(new URL('run-python.mjs', import.meta.url));
async function launch(launcher, args, extra = {}) {
  const env = {...process.env, ...extra}; delete env.DAISAE_SYNTHETIC_SECRET;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, '--project', directory, '--', ...args], {env, stdio:['ignore','pipe','pipe']});
    const timeout = setTimeout(() => child.kill(), 60000);
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    child.on('error', reject);
    child.on('close', code => {clearTimeout(timeout); resolve({code, stdout, stderr});});
  });
}
try {
  const empty = await secureStore({action:'read',directory});
  await secureStore({action:'save',directory,revision:empty.revision,rows:[
    {name:'DAISAE_SYNTHETIC_SECRET',value:'synthetic 😀\n${UNCHANGED}',assigned:true},
    {name:'DAISAE_TEST_PRECEDENCE',value:'from-file',assigned:true},
    {name:'DAISAE_TEST_EMPTY',value:'',assigned:true},
    {name:'DAISAE_TEST_UNASSIGNED',value:'',assigned:false}
  ]});
  const disk = await readFile(join(directory,'.env'),'utf8');
  assert.ok(!disk.includes('synthetic'));
  const code = 'import os,sys; assert os.environ["DAISAE_SYNTHETIC_SECRET"] == "synthetic \\U0001f600\\n${UNCHANGED}"; assert os.environ["DAISAE_TEST_PRECEDENCE"] == "from-parent"; assert os.environ["DAISAE_TEST_EMPTY"] == ""; assert "DAISAE_TEST_UNASSIGNED" not in os.environ; print("PASS: child environment")';
  const initial = await launch(originalLauncher, ['-c',code], {DAISAE_TEST_PRECEDENCE:'from-parent'});
  assert.equal(initial.code,0,initial.stderr); assert.match(initial.stdout,/PASS: child environment/);
  assert.equal(await readFile(join(directory,'.env'),'utf8'),disk);
  // Simulate removal of a versioned installation by using two fresh package
  // directories and removing the old copy. Credential identity cannot depend on either.
  const files = ['run-python.mjs','python-environments.mjs','python-environments.json','secure-store.mjs','runtime.mjs','store.py','file_lock.py','credentials.py','vendor'];
  const oldInstall = join(directory,'plugin-2.5.0'), newInstall = join(directory,'plugin-reinstalled');
  for (const destination of [oldInstall,newInstall]) {
    for (const file of files) await cp(fileURLToPath(new URL(file,import.meta.url)),join(destination,file),{recursive:true});
  }
  const old = await launch(join(oldInstall,'run-python.mjs'),['-c',code],{DAISAE_TEST_PRECEDENCE:'from-parent'});
  assert.equal(old.code,0,old.stderr);
  await rm(oldInstall,{recursive:true});
  const installed = await launch(join(newInstall,'run-python.mjs'),['-c',code],{DAISAE_TEST_PRECEDENCE:'from-parent'});
  assert.equal(installed.code,0,installed.stderr);
  assert.equal((await launch(originalLauncher,['-c','import sys; sys.exit(7)'])).code,7);
  // Exercise a script path with spaces and the interpreter override.
  await writeFile(join(directory,'script with spaces.py'),'import os\nassert os.environ["DAISAE_TEST_EMPTY"] == ""\n');
  const python = await pythonCommand();
  assert.equal((await launch(originalLauncher,['script with spaces.py'], python.args.length ? {} : {DAISAE_ENV_PYTHON:python.command})).code,0);
  // Tampering must prevent the child from executing at all.
  await writeFile(join(directory,'.env'),disk.replace('DAISAE_ENC:v1:','DAISAE_ENC:v9:'));
  const rejected = await launch(originalLauncher,['-c','print("CHILD_RAN")']);
  assert.equal(rejected.code,1); assert.ok(!rejected.stdout.includes('CHILD_RAN'));
  assert.ok(!rejected.stderr.includes('synthetic'));
  console.log('PASS: native credential reuse, concurrent initialization, decrypted child environment, Unicode, literal values, inherited precedence, exit codes, paths with spaces, reinstall in a new directory and tamper rejection.');
} finally {await rm(directory,{recursive:true,force:true});}

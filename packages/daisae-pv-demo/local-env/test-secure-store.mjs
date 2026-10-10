import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSecureStore, encryptValue, decryptValue, PREFIX} from './secure-store.mjs';

const key = randomBytes(32);
const value = 'synthetic 😀 quotes\' " \\ ${LITERAL}\nsecond line';
const encoded = encryptValue('TOKEN', value, key);
assert.equal(decryptValue('TOKEN', encoded, key), value);
assert.notEqual(encryptValue('TOKEN', value, key), encoded);
assert.throws(() => decryptValue('OTHER', encoded, key), /authentication/);
assert.throws(() => decryptValue('TOKEN', encoded, randomBytes(32)), /different encryption key/);
const parts = encoded.split(':');
const damaged = Buffer.from(parts[3], 'base64'); damaged[15] ^= 1;
assert.throws(() => decryptValue('TOKEN', [...parts.slice(0, 3), damaged.toString('base64')].join(':'), key), /authentication/);
assert.throws(() => decryptValue('TOKEN', encoded.replace('v1:', 'v2:'), key), /unsupported/);
assert.equal(decryptValue('TOKEN', '', key), '');
assert.equal(decryptValue('TOKEN', encryptValue('TOKEN', '', key), key), '');
const directory = await mkdtemp(join(tmpdir(), 'daisae-crypto-'));
const path = join(directory, '.env');
const store = createSecureStore({keyProvider: async () => Buffer.from(key)});
const read = () => store({action: 'read', directory});
const save = (snapshot, rows = snapshot.rows) => store({action: 'save', directory, revision: snapshot.revision, rows});
try {
  await writeFile(path, '# keep\nTOKEN=first-plaintext\nTOKEN=last-plaintext\nEMPTY=\nUNASSIGNED\n');
  const initial = await read();
  assert.equal(initial.needsEncryption, true);
  const saved = await save(initial);
  assert.deepEqual(saved.rows, initial.rows);
  assert.equal(saved.needsEncryption, false);
  const disk = await readFile(path, 'utf8');
  assert.ok(disk.startsWith('# keep\n'));
  assert.ok(!disk.includes('plaintext'));
  assert.equal(disk.match(/TOKEN=/g).length, 1);
  assert.ok(disk.includes(`EMPTY='${PREFIX}`));
  assert.ok(disk.includes('UNASSIGNED\n'));
  await save(saved);
  assert.equal(await readFile(path, 'utf8'), disk); // Don't rotate unchanged ciphertext.
  await assert.rejects(save(initial), /changed outside/);
  const special = await save(saved, [{name: 'TOKEN', value, assigned: true}]);
  assert.equal(special.rows[0].value, value);
  const rawSpecial = await readFile(path, 'utf8');
  assert.ok(!rawSpecial.includes('synthetic'));
  // Fresh instance models a new process/reinstalled package with the same key.
  const reinstall = createSecureStore({keyProvider: async () => Buffer.from(key)});
  assert.equal((await reinstall({action: 'read', directory})).rows[0].value, value);
  const wrong = createSecureStore({keyProvider: async () => randomBytes(32)});
  await assert.rejects(wrong({action: 'save', directory, revision: special.revision, rows: []}), /different encryption key/);
  assert.equal(await readFile(path, 'utf8'), rawSpecial);
  const missing = createSecureStore({keyProvider: async create => {assert.equal(create, false); throw new Error('missing credential');}});
  await assert.rejects(missing({action: 'read', directory}), /missing credential/);
  for (const rows of [
    [{name:'A',value:'x',assigned:true},{name:'A',value:'y',assigned:true}],
    [{name:'A',value:'\0',assigned:true}], [{name:'A',value:'x',assigned:false}],
    [{name:'BAD-NAME',value:'x',assigned:true}], [{name:'A',value:'x'.repeat(65537),assigned:true}]
  ]) await assert.rejects(save(special, rows));
  assert.equal(await readFile(path, 'utf8'), rawSpecial);
  // Parallel writers cannot both overwrite the same revision.
  const results = await Promise.allSettled([
    save(special,[{name:'A',value:'one',assigned:true}]),
    save(special,[{name:'A',value:'two',assigned:true}])
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  await writeFile(path, 'BAD LINE !\n');
  await assert.rejects(save(await read()), /invalid syntax/);
  assert.equal(await readFile(path, 'utf8'), 'BAD LINE !\n');
  console.log('PASS: authenticated encryption, random nonces, name binding, tamper/wrong-key rejection, plaintext migration, duplicates, special values, stale/concurrent saves, reinstall reuse and fail-closed behavior.');
} finally {key.fill(0); await rm(directory, {recursive:true,force:true});}

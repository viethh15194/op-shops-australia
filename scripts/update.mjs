import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './import.mjs';

await run(process.argv.slice(2), staged => new Promise((done,reject) => {
  const pkg = JSON.parse(readFileSync('node_modules/astro/package.json','utf8'));
  const cli = resolve('node_modules/astro',typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.astro);
  const child = spawn(process.execPath,[cli,'build'],{
    stdio:'inherit', env:{...process.env, OP_SHOPS_SNAPSHOT:fileURLToPath(staged)},
  });
  child.on('error',reject);
  child.on('exit',code => code === 0 ? done() : reject(new Error('Build failed. The prior snapshot is still active.')));
})).catch(error => { console.error(error.message); process.exitCode = 1; });

import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

let detected;
export async function pythonCommand() {
  if (detected) return detected;
  const candidates = process.env.DAISAE_ENV_PYTHON
    ? [[process.env.DAISAE_ENV_PYTHON, []]]
    : process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [command, args] of candidates) {
    const works = await new Promise(resolve => {
      const child = spawn(command, [...args, '-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], {stdio: 'ignore', windowsHide: true});
      const timer = setTimeout(() => child.kill(), 5000);
      child.on('error', () => {clearTimeout(timer); resolve(false);});
      child.on('close', code => {clearTimeout(timer); resolve(code === 0);});
    });
    if (works) return detected = {command, args};
  }
  throw new Error('Python 3.9 or later is required. Install Python or set DAISAE_ENV_PYTHON to its executable.');
}

export async function pythonJSON(filename, request) {
  const {command, args} = await pythonCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, '-E', '-s', '-B', '-X', 'utf8', fileURLToPath(new URL(filename, import.meta.url))], {
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
      env: {...process.env, PYTHONIOENCODING: 'utf-8'}
    });
    const chunks = []; let size = 0, timedOut = false, tooLarge = false;
    const timer = setTimeout(() => {timedOut = true; child.kill();}, 45000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 16000000) {tooLarge = true; child.kill();} else chunks.push(chunk);
    });
    child.on('error', () => {clearTimeout(timer); reject(new Error('Could not start the local Python helper.'));});
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('Credential access or file operation timed out. Check any operating-system access prompt and retry.'));
      try {
        if (code !== 0 || tooLarge) throw 0;
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!result.ok) return reject(new Error(result.error || 'Local environment operation failed.'));
        resolve(result);
      } catch {reject(new Error('The local environment helper could not complete this request.'));}
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

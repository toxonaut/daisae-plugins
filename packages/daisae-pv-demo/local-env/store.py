"""Local .env storage. Protocol on stdin/stdout; never log secret values."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
import os, json, io, hashlib, tempfile, stat, re
from file_lock import file_lock, open_regular
from dotenv.parser import parse_stream

def read_file(path):
    try:
        fd = open_regular(path, os.O_RDONLY | getattr(os, 'O_NONBLOCK', 0))
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
            raise ValueError('The .env path must be a regular file.')
        raw = f.read(1048577)
        if len(raw) > 1048576:
            raise ValueError('The .env file exceeds the 1 MB editor limit.')
        return raw

def revision(raw):
    return hashlib.sha256(b'missing' if raw is None else b'file:' + raw).hexdigest()

def snapshot(raw):
    bindings = list(parse_stream(io.StringIO((raw or b'').decode('utf-8'))))
    values = {}
    for b in bindings:
        if b.key and not b.error:
            values[b.key] = b.value
    return bindings, [{'name': k, 'value': v or '', 'assigned': v is not None} for k, v in values.items()]

def quoted(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"

def main(req):
    root = Path(req['directory']).resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Project folder is unavailable.')
    path = root / '.env'
    if req['action'] == 'read':
        raw = read_file(path)
    elif req['action'] == 'save':
        rows = req['rows']
        if len(rows) > 500:
            raise ValueError('At most 500 variables are supported.')
        names = [r['name'] for r in rows]
        if len(set(names)) != len(names) or any(not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', k) for k in names):
            raise ValueError('Use unique variable names containing letters, numbers and underscores.')
        if any(not isinstance(r['value'], str) or '\x00' in r['value'] or len(r['value']) > 400000 for r in rows):
            raise ValueError('A value contains unsupported data or exceeds 64 KB.')
        with file_lock(root / '.env.daisae.lock'):
            raw = read_file(path)
            if revision(raw) != req['revision']:
                raise ValueError('The .env file changed outside this panel. Reload before saving.')
            bindings, old_rows = snapshot(raw)
            if any(b.error for b in bindings):
                raise ValueError('The .env file contains invalid syntax. Fix it before saving encrypted values.')
            old = {r['name']: r for r in old_rows}
            desired = {r['name']: r for r in rows}
            emitted, parts = set(), []
            newline = '\r\n' if raw and b'\r\n' in raw else '\n'
            for b in bindings:
                if not b.key or b.error:
                    parts.append(b.original.string)
                    continue
                if b.key not in desired:
                    # Keep blank lines preceding an intentionally deleted assignment.
                    parts.append(re.match(r'\s*', b.original.string).group(0))
                    continue
                r = desired[b.key]
                if b.key in emitted:
                    continue
                if r == old[b.key] and sum(x.key == b.key for x in bindings) == 1:
                    parts.append(b.original.string)
                elif b.key not in emitted:
                    prefix = re.match(r'\s*', b.original.string).group(0)
                    parts.append(prefix + b.key + ('=' + quoted(r['value']) if r['assigned'] else '') + newline)
                emitted.add(b.key)
            text = ''.join(parts)
            for r in rows:
                if r['name'] not in emitted:
                    if text and not text.endswith(('\n', '\r')):
                        text += newline
                    text += r['name'] + ('=' + quoted(r['value']) if r['assigned'] else '') + newline
            data = text.encode('utf-8')
            if len(data) > 1048576:
                raise ValueError('The resulting .env would exceed 1 MB.')
            fd, tmp = tempfile.mkstemp(prefix='.env-save-', dir=root)
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                # Detect ordinary external edits made while preparing the replacement.
                if revision(read_file(path)) != req['revision']:
                    raise ValueError('The .env file changed outside this panel. Reload before saving.')
                os.replace(tmp, path)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            raw = data
    else:
        raise ValueError('Unknown environment action.')
    _, rows = snapshot(raw)
    return {'rows': rows, 'revision': revision(raw), 'exists': raw is not None}

if __name__ == '__main__':
    try:
        result = main(json.load(sys.stdin))
        print(json.dumps({'ok': True, **result}))
    except UnicodeError:
        print(json.dumps({'ok': False, 'error': 'The .env file must contain valid UTF-8 text.'}))
    except ValueError as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'Could not access the project .env file. Check permissions and ensure it is not a symlink.'}))

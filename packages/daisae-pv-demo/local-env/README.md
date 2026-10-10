# Encrypted project environment

DAISAE includes a local environment editor and Python launcher for macOS
and Windows. Encryption uses Node's built-in AES-256-GCM and Python's standard-library
native OS bindings, requiring no extra packages or manual keychain setup.
Application code runs in the separately installed shared Python environment described below.
Node 20+ and Python 3.9+ must already be available to bootstrap the installer and credential helpers.
Windows Python discovery tries `py -3`, `python`, then `python3`; macOS tries
`python3`, then `python`. `DAISAE_ENV_PYTHON` can select an exact interpreter.

## Automatic key lifecycle

The supported plugin package has no install/uninstall script configured. Instead,
the local MCP server automatically initializes credentials on its first startup,
without blocking tool discovery. Subsequent editor operations retry access if the
OS denied it. A launcher used before server startup can initialize a key too.

A single cryptographically random 256-bit key is created per OS user, per machine:

- macOS: a generic password in the default Keychain, service
  `com.daisae.environment`, account `environment-master-key-v1`.
- Windows: a generic Windows Credential Manager entry with target
  `com.daisae.environment/environment-master-key-v1`, persisted for the current
  user on the local machine. This is Windows-managed credential protection;
  there is no plaintext key file.

The identity does not include the package version, install directory, or project
path. OS file locks serialize creation across plugin processes. Initialization
reads an existing credential first and never rotates/replaces a valid key.
An invalid, locked, or inaccessible credential produces an error, not a new key.

Uninstall removes plugin files, not this OS credential or users' project files.
Reinstall and upgrades reuse that one entry: keys do not accumulate. The plugin
has no credential-delete/uninstall hook. Its non-secret lock file lives in
`~/Library/Application Support/DAISAE/environment` on macOS or
`%LOCALAPPDATA%/DAISAE/environment` on Windows and is also reused.

Deleting the credential manually, deleting the OS user profile, or moving the
file to a different computer loses automatic access to existing encrypted data.
The launcher never creates a replacement key when reading encrypted values;
startup may provision a new key if the credential was deleted, but the key ID in
old ciphertext prevents it from being used to overwrite/decrypt that data.
Restore the original credential or re-enter the secrets. Key migration/export
and rotation are not provided in this version. macOS may show an OS access prompt,
especially if the Python executable changes. Access to an unlocked OS user account
is not prevented by encryption at rest.

## Editor behavior

Host-provided MCP filesystem roots determine the available project folders.
If the host supplies none, set `DAISAE_ENV_PROJECT_DIR` in the local MCP connection.
The distributed manifest contains no developer-specific machine or project paths.
The selected destination is always displayed; multiple roots can be selected.

Values are masked and sent only in UI metadata, not model-visible tool results.
They are never sent to the Railway dataset server. Save encrypts every assigned
value, including empty strings. The format is:

```text
TOKEN='DAISAE_ENC:v1:<key-id>:<base64 nonce + tag + ciphertext>'
```

Each changed value receives a random 96-bit nonce and a 128-bit authentication tag.
The variable name is authenticated as associated data. Moving ciphertext to a
different variable name or modifying it fails authentication. Variable names and
comments remain readable; do not put secrets in comments. The `DAISAE_ENC:` prefix
is reserved on disk; a literal value with that prefix can still be entered through
the editor and is encrypted normally.

Existing plaintext `.env` files can be read without modification. The panel enables
Save to migrate them. The next save encrypts every assigned value and removes old
duplicate assignments. Missing assignments remain unassigned. Existing encrypted
values that were not edited retain their ciphertext. Standalone comments are
preserved; rewritten assignments may lose inline comments/formatting. Invalid
syntax must be corrected before saving. Files larger than 1 MiB are rejected;
encryption overhead counts toward this limit.

Saves use a per-project OS lock, a revision check, and atomic replacement. A stale
panel cannot overwrite a newer save. POSIX files are owner-only; Windows uses the
project folder's inherited ACLs and stores only ciphertext. Linked/reparse-point
files are rejected. No decrypted temporary `.env` is written. This does not erase
old plaintext copies held by backups, sync, version control or other processes.

## Python

Use the absolute path of the installed plugin's launcher (quote paths with spaces):

```text
node <plugin>/local-env/run-python.mjs --project <project-folder> -- script.py
node <plugin>/local-env/run-python.mjs --project <project-folder> -- -m module
```

The bundled `python-environment` skill directs the agent to use this launcher
when working with DAISAE project variables. Generated scripts use normal
`os.environ['TOKEN']`. There is no global Python modification: running Python
outside this launcher does not load/decrypt `.env` automatically. Skill selection
is agent guidance rather than an enforced interception of every Python command.

The child runs in the chosen project folder. Explicitly inherited variables take
precedence (case-insensitive on Windows), values are literal without `${...}`
interpolation, and exit codes are propagated. Child code/output can reveal its
secrets: this is encryption at rest, not isolation from authorized Python code.
Do not use ordinary `load_dotenv` on encrypted values; it would read ciphertext.
Tools outside this launcher must explicitly support the encrypted format.

## Build and verification

From the repository root:

```text
node packages/daisae-pv-demo/local-env/build.mjs
python3 packages/daisae-pv-demo/local-env/test-credentials.py
python3 packages/daisae-pv-demo/local-env/test-store.py
node packages/daisae-pv-demo/local-env/test-secure-store.mjs
node packages/daisae-pv-demo/local-env/test-native.mjs
node test-env-mcp.mjs
```

On Windows use `py -3` instead of `python3`. The native/MCP tests use the real,
persistent DAISAE credential with synthetic values in temporary directories.
They intentionally retain the single key so existing projects remain readable.
The unit tests inject a key provider in code; there is no production environment
variable for disabling credential protection or overriding the encryption key.

Verified on macOS: native credential initialization/reuse, concurrent callers,
encrypted saves, UI-only tool metadata, literal/Unicode values in child Python,
exit codes, paths with spaces, reinstall simulation from a new package directory,
tampering/wrong-key rejection and stale/concurrent save handling.
Windows native APIs and startup still need a real Windows smoke test before rollout.

## Default project folder

The opener accepts `projectDirectory` from the current chat’s working directory.
Without that argument, it uses host-provided MCP roots. It never defaults to the
plugin working directory or a hardcoded project. If menu launch provides neither,
the panel offers “Use this chat’s project” to ask the chat to reopen it with its
current working directory. The host must supply project context for fully
automatic menu launch.

## Persistent shared Python environments (DAISAE 2.7)

Application Python now uses `main` by default. Its `.venv` lives under
`~/Library/Application Support/DAISAE/python/environments/main/.venv` on macOS,
`%LOCALAPPDATA%/DAISAE/python/environments/main/.venv` on Windows, or
`~/.local/share/DAISAE/python/environments/main/.venv` on Linux. Projects do not
receive separate environments. Plugin updates/removal do not delete this directory.
`DAISAE_PYTHON_HOME` can explicitly select another absolute managed root.

Tools:

- `list_python_environments`: versions, paths, requested/installed packages,
  framework source records, defaults and readiness.
- `install_python_environment`: create/repair `main` or another named environment;
  defaults to the detected system Python version. An explicit `pythonVersion`
  downloads a missing interpreter through pinned uv into DAISAE's managed runtime
  directory. An existing environment's Python version cannot be replaced silently.
- `get_python_environment_operation`: installers return immediately with an
  operation ID. Check until complete or failed before running Python.
- `install_python_framework`: install Forkscope from a verified, preferably pinned
  git+https repository URL or an absolute local installable package path. No real
  Forkscope repository is assumed or downloaded until supplied.
- `uninstall_python_environment`: explicitly remove one named managed environment;
  preserve all projects, .env files, OS credentials, other environments, downloaded
  Python runtimes and the installer cache. This is never called on plugin removal.

The editable defaults live in `python-environments.json`. The initial package set
is NumPy, pandas, SciPy, scikit-learn, Matplotlib, requests and python-dotenv with
explicit versions. Other environments can disable defaults and request their own
packages. The environment tools never inject project secrets into installers or
package build hooks. Failed package installs mark the environment `needs_repair`;
repeat setup or remove/recreate that selected environment before running code.

The launcher accepts `--environment <name>` before `--`; otherwise it uses `main`
or the explicit `DAISAE_PYTHON_ENVIRONMENT` selection. It sets VIRTUAL_ENV and PATH
for the selected interpreter, runs in the current project directory, and uses the
same existing encrypted variable loader. `DAISAE_ENV_PYTHON` still overrides the
interpreter when deliberately set. Credential helpers retain their independent
bootstrap Python selection to avoid requiring packages/environments for .env editing.

CLI equivalents, useful before refreshed MCP discovery:

```
node <plugin>/local-env/manage-python.mjs list
node <plugin>/local-env/manage-python.mjs install '{"environment":"main"}'
node <plugin>/local-env/manage-python.mjs install '{"environment":"legacy","pythonVersion":"3.10","includeDefaults":false}'
node <plugin>/local-env/manage-python.mjs framework '{"environment":"main","source":"/absolute/Forkscope/repository"}'
node <plugin>/local-env/manage-python.mjs uninstall '{"environment":"legacy"}'
```

Installing a framework requires that its repository be Python-installable; custom
non-package setup must follow that repository's actual instructions through the
selected environment. The Forkscope skill checks those instructions and Python
compatibility first. Do not claim real Forkscope installation from the installer
fixture test.

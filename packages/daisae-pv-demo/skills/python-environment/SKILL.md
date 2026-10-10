---
name: python-environment
description: Use when writing, running, or installing Python code with DAISAE, managing shared Python environments, or loading encrypted project .env variables. Routes general Python work to main and supports named environments on macOS and Windows.
---

# DAISAE shared Python environments

For Python work, run Python using this plugin's bundled launcher so the project's `.env` is loaded
and DAISAE-encrypted values are decrypted automatically. Resolve the launcher
relative to this skill: `../../local-env/run-python.mjs`. Use its absolute path.
Never hard-code a plugin version or a cache path into project code.

```text
node <absolute-plugin-path>/local-env/run-python.mjs --project <absolute-project-folder> -- script.py [arguments]
```

The launcher also accepts Python `-m module` and `-c code`. Pass arguments as
separate arguments, quoting filesystem paths when using a shell. Use the actual
project directory from the task; do not guess a different project's directory.
Node 20+ and a bootstrap Python 3.9+ are required. Application code uses the
persistent shared `main` environment by default, outside the plugin and projects.
Use `list_python_environments` to inspect versions and default packages. If main
is missing, use `install_python_environment` within the user's authorized Python
setup scope. Installer tools return an operation ID; poll
`get_python_environment_operation` at reasonable intervals until complete before
running Python. Explicit uninstall/reinstall of the plugin preserves all environments.
To use another named environment, add `--environment <name>` before `--` in the
launcher command. Create a separately named environment for a different Python
version; never replace the interpreter in an existing environment. Default
packages are listed in `../../local-env/python-environments.json`; inspect them
before changing them. Install additional packages through the environment tool,
not global pip. `DAISAE_ENV_PYTHON` is an explicit interpreter override and remains
supported. Credential helpers can use the bootstrap system Python independently.

Environment installation is a local operation and does not deploy to Railway.
Only call `uninstall_python_environment` when the user requests that removal.
Do not remove the credential entry, project .env files, reusable runtimes, or other
environments during environment removal. Never silently reset an encryption key.
For Forkscope, use the `forkscope` skill and verified repository requirements.

Write ordinary Python using `os.environ['VARIABLE_NAME']` or `os.getenv(...)`.
Do not embed secrets, decryption code or keys in generated programs. Do not use
`load_dotenv` on encrypted files: it would load ciphertext. Inherited environment
variables take precedence; `.env` values are literal (no interpolation).

Use the Environment variables panel to enter/edit credentials. Values are
masked there and encrypted when saved. Do not read or print raw credentials or
the native key into the conversation just to check whether they are available.
Report presence or success unless the user explicitly requests the actual value.
Child Python output is ordinary tool output, so never promise that arbitrary
scripts cannot reveal their environment.

The encryption key is created automatically on the local MCP server's first
startup and reused from macOS Keychain / Windows Credential Manager. It is not
stored in the plugin folder. Uninstall/reinstall and upgrades do not rotate it.
If credential access fails or a file requires a different key, stop that operation
and explain the error. Never delete/reset credentials or silently save plaintext.
A different OS user or machine needs the original key or re-entered secrets;
this version does not provide key export/import.

## Remote execution

When the user explicitly requests Python on the remote MCP/Railway environment, use the sibling `remote-python` skill instead of the local launcher. Remote sessions do not load the local project's .env and must never receive its credentials automatically.

---
name: forkscope
description: Set up and use the Forkscope modelling framework with DAISAE. Applies to Forkscope modelling requests, repository installation, or framework environment selection.
---

# Forkscope with DAISAE

The configured repository is https://github.com/alonso130r/forkscope. Its package requires Python >=3.10 and supports main's Python 3.11. Read `../../local-env/python-environments.json` for the pinned default source. Use a different exact repository or local source if supplied by the user.
If none is configured, ask for it; do not install a similarly named package or
invent Forkscope APIs. Read that repository's installation instructions,
Python constraints and modelling examples before installing or using it.

Forkscope can be installed into DAISAE's persistent `main` environment using
`install_python_framework` with `framework: forkscope` and the verified source.
Installer tools return an operation ID; check `get_python_environment_operation`
until complete before running a smoke test. Prefer a git+https URL pinned to a commit for repeatable installs. If its Python
or dependency requirements conflict with main, explain the concrete conflict
and use a separately named environment with the required Python version.
Do not replace main's Python version or claim compatibility without checking.

Use DAISAE's bundled launcher for modelling commands:

```
node <absolute-plugin-path>/local-env/run-python.mjs --project <current-project> -- <script.py>
node <absolute-plugin-path>/local-env/run-python.mjs --project <current-project> --environment forkscope -- <script.py>
```

Resolve the launcher relative to this skill: `../../local-env/run-python.mjs`.
It injects the current project's decrypted .env variables at startup. Write
normal os.environ access in Python; never embed credentials in generated code.
Follow actual framework examples, run a documented smoke test after installing,
and report which source revision, Python environment and outputs were used.

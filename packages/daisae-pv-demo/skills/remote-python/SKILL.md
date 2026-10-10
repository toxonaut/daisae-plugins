---
name: remote-python
description: Create and resume persistent Python sessions on DAISAE's Railway worker; execute code remotely, register project-linked datasets and files, query datasets, and download artifacts.
---

Use this workflow when the user requests the remote Python MCP environment, remote execution, or its sessions/results. Ordinary local Python work stays with the python-environment skill.

1. Read get_python_usage_guide before writing a remote program. Tools are on DAISAE's remote MCP connection; refresh discovery if missing.
2. Reuse a user-provided session ID or locate a suitable session with list_python_sessions. Otherwise create_python_session with the current chat's absolute project folder as projectFolder. For cloud projects use the explicit stable project identifier. Omit it when there is no project; never guess.
3. Write ordinary Python using the supplied packages. Register dataframe outputs with `daisae.save_dataset(df, name='SQL_IDENTIFIER')`. Register files with `daisae.save_artifact('plot.png', name='Optional display name')`. Files created or changed under `artifacts/` are also registered automatically. Use explicit registration for datasets.
4. Run execute_python and poll get_python_execution until completed, failed, timed_out, cancelled or interrupted. Do not report a queued execution as completed. Inspect stdout, stderr, kernel generation and returned artifacts.
5. Provide requested download links and session ID. Label S3/Snowflake locations as simulated. Real storage is a Railway persistent volume; this is not a connection to either cloud product. Generated data is only simulated when the program generated it as such; real uploaded datasets must not be relabeled synthetic.

Sessions retain variables while their kernel is alive. Default idle expiry is 24 hours, extendable to seven days. Worker restarts, cancellation and timeouts reset the kernel and increment its generation on next execution. Never assume variables survived a reset. Saved registered artifacts persist independently for seven days.

To use a saved result in a new session, call import_python_artifact, then `daisae.load_object(artifact_id)` or `daisae.load_dataset(dataset_id)`. Upload small input files with upload_python_file (base64, up to 10 MB). Executed code has no network or subprocess access; fetch inputs through approved tools before uploading. Do not upload local .env files, credential stores or secrets.

Use query_python_dataset for bounded read-only SQL on the table named `dataset`. Use get_python_artifact to refresh download links, which expire after ten minutes. open_python_results opens the project-filtered explorer. Do not close or delete a session/artifacts unless requested or cleaning up sessions created solely for your own verification.

## Unified simulated Snowflake library

Register every final dataset with `daisae.save_dataset` unless the user explicitly requests otherwise; intermediate dataframes can stay in memory. Registered Python datasets automatically appear alongside PV datasets in `open_dataset_viewer`, under the inherited projectFolder, without copying or re-registering their rows. The common explorer supports arbitrary columns, paging, search, Delete and Undo. File artifacts remain in `open_python_results`. Python dataset storage is simulated Snowflake; do not assume the dataset contents are synthetic. Existing registrations are discovered automatically while unexpired.

## Download artifacts to the local project

When asked to download an artifact to a project, call get_python_artifact for fresh metadata, then the local environment server's download_python_artifact_to_project tool. Pass artifact_id, download_url, sha256, filename (datasets use `<name>.parquet`), and the intended existing absolute projectDirectory. Use the registered projectFolder when it is the intended local project; otherwise use the current chat project or ask for a destination if neither exists. Do not interpret a cloud project identifier as a filesystem path. Return a clickable absolute local file link. Keep the remote object; do not overwrite existing files unless explicitly requested. The locally launched Artifact explorer downloads directly through its local MCP tool after a one-time explorer sign-in. The remote chat viewer uses a chat request for local downloads. Browser download remains a separate option.

## Results overview and example
Open Python results explorer to inspect session status, expiry and output counts, extend sessions, or run the built-in example. Clear outputs moves registered results to recoverable trash and keeps working files and the session open; use restore_python_session_outputs to undo before expiry. Do not describe this as physical deletion. Newly executed programs retain generating code for output provenance. For conversational demos, create a project-linked session and produce a dataset, CSV, chart and report using the storage helpers; retrieve fresh artifact links before downloading.

Download to project in the local explorer uses its local MCP downloader; the remote viewer uses the chat-mediated downloader. Treat an opened page or a sent request as pending, never as a confirmed save. Report success only after the local tool returns a saved path and checksum.

Artifact lifecycle: Artifact explorer offers Active outputs and Trash. Use trash_python_artifact for recoverable deletion and restore_python_artifact before expiry. delete_python_artifact_permanently requires the output to be in trash; it removes its registration, stored object, linked Sim Snowflake table and matching original/session staging files while keeping the session open. Modified session files and downloaded local copies remain. Do not permanently delete without the user's explicit instruction.

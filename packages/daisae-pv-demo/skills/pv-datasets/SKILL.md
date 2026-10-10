---
name: pv-datasets
description: Create a simulated pharmacovigilance dataset for a named drug and display it in the DAISAE Dataset viewer.
---

For requests such as "give me the PV data for Tocilizumab", call `show_pharmacovigilance_table` with `drug: "Tocilizumab"` and optionally the original question. Extract the drug from the user request; ask for it if missing. Each new dataset request should make a new call, including repeated requests for the same drug. Do not reuse a previous dataset as a new result.

When creating a table, pass `projectFolder` using the current chat’s absolute project folder from host/task context. For a cloud project without a folder, use its explicit stable project identifier or name. Use the same value across chats in that project. If the user explicitly asks for an unassigned table, or no project context is available, omit `projectFolder`; do not guess or use the plugin installation folder.

The MCP app renders the table. Reply briefly with the drug, total row count, dataset name and simulated status. Do not reproduce preview rows as a Markdown table. Metadata includes a simulated Snowflake table name; do not claim an actual Snowflake query or real safety evidence. APPROVAL_DATE is simulated report approval date.

Only 20 preview rows belong in model context. Do not call the app-only paging tool, extract its token, fetch additional rows for the model, or export/rebuild the full table. The viewer handles paging and search directly. If the host cannot render the app, explain the limitation without dumping rows into chat. An old Signal explorer schema indicates the app's tools need refreshing.


For requests to browse, list, open, or manage existing tables (including the default prompt to show all invented data), call `open_dataset_viewer` with `{}`. The explorer includes an All projects filter, individual project filters, and No project for unassigned tables (including older tables). Project labels are catalog metadata, not access controls. This opens the persistent shared library without creating a new dataset or asking for a drug. The Dataset viewer thread entrypoint also opens from the host side-panel Tools menu without a chat prompt. Every chat sees the same server catalog; this no-auth demo does not implement per-user ownership.

The user selects a table and confirms deletion inside the viewer. Deletion moves the table to trash; Undo restores it until its original expiry. Do not call app-only selection, delete, restore, list, or paging tools on behalf of the model. Do not claim automatic startup or side-panel availability until the host discovers the entrypoint and it is actually visible. Refresh the app connection after tool metadata changes.


## Authentication

The remote DAISAE MCP connection requires OAuth sign-in. Use the host’s MCP connection/login workflow; Google sign-in permits only the verified account martin.schaerer@gmail.com. If a tool reports authentication is required, direct the user to reconnect/sign in to DAISAE, then retry after connection succeeds. Never ask for passwords, authorization codes, access tokens, or client secrets in chat. All remote dataset calls, including viewer paging and management, require the authenticated connection.

The Dataset explorer is the unified simulated Snowflake library: it includes both simulated PV tables and registered remote Python datasets, with their project associations. Python dataset contents are not necessarily simulated; only their Snowflake storage identifiers are simulated. Browse and manage both through the viewer. Keep row paging and Delete/Undo inside the app.

# DAISAE Workbench

This bundled local MCP App installs with DAISAE. `open_daisae_workspace` registers a global navigation entry with the top-view daisy SVG in `../assets/daisy.svg`.

Six cards offer guided research prompts. They use MCP Apps `ui/message`; hosts advertising `experimental["openai/message"]` receive `target: "new"`. Other messaging hosts receive the prompt in the active chat. Hosts without messaging and standalone previews show a copyable prompt. A rejected or uncertain launch shows a fallback without automatically resending.

The cards are workflow starters, not implementations of the external research systems. Their prompts ask for inputs and discover available integrations. No LSMV schema, Forkscope capabilities, or MedDRA codes are fabricated.

Build from the MCP repository with Node 20 or newer:

```sh
node packages/daisae-pv-demo/workspace/build.mjs
node packages/daisae-pv-demo/workspace/test-mcp.mjs
```

The built server and HTML contain their JavaScript dependencies. The plugin preserves the existing remote dataset server, local environment server, and skills. No separate dependency installation is required by plugin users.

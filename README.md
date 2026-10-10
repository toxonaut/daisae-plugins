# DAISAE plugin marketplace

Install the DAISAE plugin from this private GitHub marketplace in the desktop app.

## Add marketplace

In Plugins → Add → Add plugin marketplace, enter:

- Source: `toxonaut/daisae-plugins`
- Git ref: `main`
- Sparse paths: leave empty

Add the marketplace, then install DAISAE from it. GitHub access to this private repository is required. The DAISAE remote connection prompts for Google sign-in; Dataset explorer uses that same connection.

The package includes skills, bundled local tools, Workbench, project environment controls, remote Python workflows, MedDRA mapping, and molecular embeddings with 2D structures. The remote service continues to run on Railway. Local tools require Node.js 20 or newer; this distribution targets the desktop application, not web-only execution of local tools.

## Updating

Update files in `packages/daisae-pv-demo`, increment both plugin manifest versions, and push to `main`. Refresh the marketplace in the app to discover updates.

Marketplace definition: `.agents/plugins/marketplace.json`.

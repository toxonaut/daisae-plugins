---
name: meddra-mapping
description: Open the DAISAE MedDRA concept mapping example for low platelets with selectable PT candidates and primary SOC hierarchy.
---
For mapping "low platelets", call `map_meddra_concept` with `concept: "low platelets"`. Let the app show candidates, preferred markers and primary SOC → PT hierarchy. Do not replace the app with a chat table or automatically select preferred terms. The user chooses terms and explicitly sends them back as "selected meddra PTs". Treat that message as the user's chosen candidates, not a verified coding decision.
This is a fixed demonstration fixture, not an official terminology lookup. It provides no verified MedDRA version, codes, HLT/HLGT or LLT paths. Do not invent those. Other concepts are unsupported by this tool; use an authorized terminology source for real mapping. Do not add "simulated" to the example interface or response.

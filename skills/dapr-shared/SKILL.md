---
name: dapr-shared
description: Shared reference files for the Dapr skills. Not a task skill, never invoke it. Other Dapr skills read its files by path.
disable-model-invocation: true
user-invocable: false
---

# Dapr shared reference files

This folder holds content shared by the Dapr Workflow and agent skills in
[diagrid-labs/dapr-skills](https://github.com/diagrid-labs/dapr-skills).
Skills reference these files as `../dapr-shared/<file>`, so this skill must be
installed next to them. Install all skills with:

    npx skills add diagrid-labs/dapr-skills --skill "*"

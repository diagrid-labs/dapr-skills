---
name: dapr-shared
description: Shared reference files (component YAMLs, prerequisite checks, review checklists, language references) used by the Dapr Workflow, pub/sub and agent skills. Not a task skill — do not invoke it directly; other Dapr skills read its files by relative path.
disable-model-invocation: true
user-invocable: false
---

# Dapr shared reference files

This folder holds content shared by the Dapr Workflow and agent skills in
[diagrid-labs/dapr-skills](https://github.com/diagrid-labs/dapr-skills).
Skills reference these files as `../dapr-shared/<file>`, so this skill must be
installed next to them. Install all skills with:

    npx skills add diagrid-labs/dapr-skills --skill "*"

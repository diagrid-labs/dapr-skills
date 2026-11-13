# Python pub/sub project files

Package versions come from [dapr-versions.md](dapr-versions.md) — change a pin there, not here.

Placeholders are resolved from the specification interview; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md).

## Workspace root pyproject.toml

```toml
[project]
name = "<root-kebab>"
version = "0.1.0"
requires-python = ">=3.12"

[tool.uv.workspace]
members = ["contracts", "publisher", "subscriber"]
```

## contracts package

`contracts/pyproject.toml`:

```toml
[project]
name = "<root-kebab>-contracts"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["pydantic==2.12.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["contracts"]
```

The module lives at `contracts/contracts/__init__.py`.

## Service pyproject.toml

The publisher; the subscriber variants are listed below.

```toml
[project]
name = "<root-kebab>-publisher"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "<root-kebab>-contracts",
    "dapr==1.19.0",
    "fastapi==0.118.2",
    "pydantic==2.12.0",
    "uvicorn==0.37.0",
]

[tool.uv.sources]
<root-kebab>-contracts = { workspace = true }
```

Subscriber dependencies by type:

| Type | Dependencies besides `<root-kebab>-contracts` |
|---|---|
| declarative | `fastapi==0.118.2`, `pydantic==2.12.0`, `uvicorn==0.37.0` (no `dapr`) |
| programmatic | `dapr[fastapi]==1.19.0`, `fastapi==0.118.2`, `pydantic==2.12.0`, `uvicorn==0.37.0` |
| streaming | `dapr==1.19.0`, `pydantic==2.12.0` |

## Single-service pyproject.toml

The same as the service file but without the contracts dependency or `[tool.uv.sources]`, and with `models.py` instead of the `contracts` module.

## Key points

- Run `uv sync --all-packages` at the root.
- There is one Dapr version to keep aligned, not two: from Dapr 1.19 the FastAPI extension is the
  `fastapi` extra of the `dapr` distribution, so `dapr[fastapi]==1.19.0` is a single coordinate.
  Quote the brackets in shell commands — `uv add "dapr[fastapi]==1.19.0"` — because `[` is a glob
  character in POSIX shells and a wildcard in PowerShell.
- A project still carrying `dapr-ext-fastapi` is pre-1.19. Never pin `dapr==1.19.0` beside it: that
  puts two copies of `dapr.ext.fastapi` on the import path and which one wins depends on install
  order. Either migrate both to the extra, or leave the old pair matched at `1.18.3`.

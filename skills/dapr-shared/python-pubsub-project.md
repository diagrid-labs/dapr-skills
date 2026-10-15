# Python pub/sub project files

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
    "dapr==1.18.3",
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
| programmatic | `dapr==1.18.3`, `dapr-ext-fastapi==1.18.3`, `fastapi==0.118.2`, `pydantic==2.12.0`, `uvicorn==0.37.0` |
| streaming | `dapr==1.18.3`, `pydantic==2.12.0` |

## Single-service pyproject.toml

The same as the service file but without the contracts dependency or `[tool.uv.sources]`, and with `models.py` instead of the `contracts` module.

## Key points

- Run `uv sync --all-packages` at the root.
- `dapr` and `dapr-ext-fastapi` share one version.
- An add skill aligns `dapr-ext-fastapi` to an existing `dapr==1.18.x` pin.

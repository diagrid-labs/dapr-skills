# State Store Selection for Dapr Workflows

## Overview

Dapr Workflows are built on top of Dapr Actors. The workflow engine registers internal actor types
(`dapr.internal.{namespace}.{appID}.workflow` and `dapr.internal.{namespace}.{appID}.activity`)
and uses the configured actor state store to persist workflow history, inbox messages, and metadata.

Because workflows inherit the actor state store requirements, not every Dapr state store can be
used to back workflows. You must explicitly designate a state store as the actor state store.

Source: [workflow-architecture.md — State store usage](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/#state-store-usage)

---

## Requirements

A state store must meet all three of the following requirements to be used as an actor (and
therefore workflow) state store:

| Requirement | Why it matters |
|---|---|
| **ETag support** | Dapr uses ETags for optimistic concurrency control on actor state writes. Without ETags, concurrent sidecar restarts can corrupt state. |
| **Multi-item transactions (ACID)** | Workflow checkpoints write inbox entries, history events, and metadata atomically. A partial write leaves the workflow in an inconsistent state. |
| **First-write-wins semantics** | Placement-based actor activation assumes only one writer wins a race. Stores that silently overwrite concurrent writes are unsafe. |

From the Dapr docs: _"State stores can be used for actors if it supports both transactional operations
and ETag."_

---

## Confirmed Stores

The following stores are validated and commonly used in production:

### Redis (`state.redis`)

- Fast, in-memory, low latency
- Supports ETags and multi-key transactions (via `MULTI/EXEC`)
- **Recommended for**: local development, staging, high-throughput low-durability workloads
- **Limitation**: volatile by default — data loss on restart unless AOF/RDB persistence is configured

### PostgreSQL (`state.postgresql` v2)

- Durable, ACID-compliant, queryable
- Supports ETags (optimistic concurrency via row versioning) and transactions
- **Recommended for**: production workloads requiring durability and auditability
- **Limitation**: slightly higher write latency than Redis; requires connection pool tuning at scale

### Azure CosmosDB (`state.azure.cosmosdb`)

- Globally distributed, multi-region writes
- Supports ETags and transactions (within a single partition)
- **Recommended for**: multi-region deployments
- **Critical limitation**: max document size 2 MB, max transaction size 100 operations.
  Workflows with large activity I/O or many parallel branches will hit these limits and fail
  with error code `413`. The Dapr docs explicitly note CosmosDB is likely unsuitable for
  complex production workflows. There is no migration path once limits are exceeded.

### Trade-off Summary

| Store | Write Latency | Durability | Cost | Query | Max State Size |
|---|---|---|---|---|---|
| Redis | Very low | Low (default) | Low | No | Memory-bound |
| PostgreSQL | Low–medium | High | Medium | Yes (SQL) | Effectively unlimited |
| CosmosDB | Low (in-region) | High | High | Limited | 2 MB per document |

---

## Verification Required

The following stores support the `actorStateStore: "true"` metadata key but require additional
validation before recommending for production workflow workloads:

**MySQL** (`state.mysql`): Supports transactions and ETags. Requires validation of behavior under
concurrent actor activation. Check your MySQL version supports row-level locking as expected.

**MongoDB** (`state.mongodb`): Supports transactions and ETags, but transactions require MongoDB to
be running as a **Replica Set**. A standalone MongoDB instance does NOT support transactions and
cannot be used as an actor state store. Validate your deployment topology before use.

---

## Configuration Examples

### Redis as Actor State Store

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: workflow-statestore
  namespace: default
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: "redis-master:6379"
  - name: redisPassword
    secretKeyRef:
      name: redis-secret
      key: password
  - name: actorStateStore
    value: "true"
```

### PostgreSQL (v2) as Actor State Store

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: workflow-statestore
  namespace: default
spec:
  type: state.postgresql
  version: v2
  metadata:
  - name: connectionString
    secretKeyRef:
      name: postgres-secret
      key: connection-string
  - name: maxConns
    value: "20"
  - name: connectionMaxIdleTime
    value: "5m"
  - name: actorStateStore
    value: "true"
```

---

## Best Practice: Separate State Stores

Use a dedicated state store component for workflows, separate from any state store your application
uses for its own data.

**Why this matters:**

- **Isolation**: Workflow history growth does not interfere with application state query performance.
- **Independent scaling**: You can tune connection pools and resource limits per store.
- **Operational clarity**: Backup, retention, and cleanup policies differ between workflow state
  (event-sourced history) and application state (current values).
- **Avoid history bloat**: Workflow actors write append-only history. Over time, completed workflows
  accumulate state that must be explicitly purged. Keeping this in a separate store makes purge
  operations contained.

Name the workflow state store component distinctly (e.g., `workflow-statestore`) and reference it
only from the Dapr configuration — not from application code.

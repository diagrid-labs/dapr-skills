# State Store Selection for Dapr Workflows

## Overview

Dapr Workflows are built on top of Dapr Actors. The workflow engine registers internal actor types
(`dapr.internal.{namespace}.{appID}.workflow` and `dapr.internal.{namespace}.{appID}.activity`)
and uses the configured actor state store to persist workflow history, inbox messages, and metadata.

Because workflows inherit the actor state store requirements, not every Dapr state store can be
used to back workflows. You must explicitly designate a state store as the actor state store.

Source: [workflow-architecture.md — State store usage](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/#state-store-usage)

---

## Supported for Workflow

**Actor support does not imply workflow support.** The [supported state stores
table](https://docs.dapr.io/reference/components-reference/supported-state-stores/) has a
**Workflow column that is separate from its Actors column**, and that table is the authoritative
answer. The workflow architecture page describes the actor requirements and reads as though any
actor-capable store will do; it is the weaker source, and where the two disagree the component
table wins.

These stores support Dapr Workflow:

> etcd · In-memory · MongoDB · MySQL & MariaDB · Oracle Database · Autonomous Database (ATP/ADW) ·
> PostgreSQL v1 · PostgreSQL v2 · Redis · SQLite · SQL Server V1 · SQL Server V2

These support **Actors but not Workflow**, which is the trap this page exists to prevent:

> Azure Cosmos DB · AWS DynamoDB · CockroachDB · RavenDB

Picking one of those for actors and assuming workflows will follow is the most expensive mistake
on this page: the component is accepted, the app starts, and the failure arrives later.

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

---

## Not supported for Workflow

### Azure Cosmos DB (`state.azure.cosmosdb`) — **not supported**

Cosmos DB supports Dapr **Actors**, not Dapr **Workflow**. The components table's Workflow column
does not list it, so do not choose it to back a workflow app, in any region topology.

This page previously recommended it for multi-region deployments, with its document limits given
as a caveat. That was wrong twice over: the limits were not the main problem, and the limits are
not what rules it out. For background, Cosmos DB caps a document at 2 MB and a transaction at 100
operations, which a workflow with large activity I/O or many parallel branches would exceed with
error `413` — but a store that is not in the Workflow column should not be reached for in the
first place.

For a multi-region workflow deployment, choose from the supported list above — PostgreSQL v2 and
the SQL Server variants are the usual answers — and solve geography with the database's own
replication rather than with the state store component.

### AWS DynamoDB, CockroachDB, RavenDB — **not supported**

The same trap. All three are actor-capable and none of them appears in the Workflow column. A team
that already runs one of them for actors needs to hear this explicitly: it cannot carry workflows,
and the workflow app needs a second, supported store designated with `actorStateStore: "true"`.

### Trade-off Summary

Both rows below are supported for Workflow. Cosmos DB is deliberately absent: a store that cannot
back a workflow does not belong in a table of workflow trade-offs.

| Store | Write Latency | Durability | Cost | Query | Max State Size |
|---|---|---|---|---|---|
| Redis | Very low | Low (default) | Low | No | Memory-bound |
| PostgreSQL | Low–medium | High | Medium | Yes (SQL) | Effectively unlimited |

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

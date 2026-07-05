# SpacetimeDB Skill

Loaded when the project uses SpacetimeDB (a database built on a
multi-modal architecture supporting relational, document, and time-series
workloads). Supplements `rules/sql.md` with SpacetimeDB-specific patterns.

---

## Setup

- **Connect**: `spacetime connect <host>`
- **Query**: `spacetime sql <database> "<query>"`
- **Import**: `spacetime import <database> <file>`
- **Export**: `spacetime export <database>`

## Key Concepts

SpacetimeDB is designed for high-performance workloads with a focus on
low-latency queries and hybrid data models. Key features:

| Feature | Description |
|---------|-------------|
| Multi-modal | Supports relational, document, and time-series models |
| Temporal queries | First-class time-travel queries (AS OF, BETWEEN timestamps) |
| Distributed | Built-in sharding and replication |
| SQL + NoSQL | Query via SQL or native document API |

## Data Modelling

### Relational Tables

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
```

### Document Collections

```
db.collection('users').insertOne({
    _id: 'user_1',
    name: 'Alice',
    email: 'alice@example.com',
    metadata: { plan: 'premium' }
});
```

### Time-Series Tables

```sql
CREATE TABLE events (
    id          BIGINT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    payload     JSONB,
    recorded_at TIMESTAMPTZ NOT NULL
) USING TIMESERIES;

-- Time-series queries
SELECT * FROM events
WHERE recorded_at BETWEEN '2026-01-01' AND '2026-07-01'
AND event_type = 'purchase';
```

## Temporal Queries

```sql
-- Query data as it existed at a point in time
SELECT * FROM users AS OF '2026-06-01 00:00:00Z'
WHERE id = 'abc-123';

-- Compare current vs historical state
SELECT current.name AS current_name,
       history.name AS historical_name
FROM users current
JOIN users AS OF '2026-01-01' history
  ON history.id = current.id
WHERE current.id = 'abc-123';
```

## Conventions

- **Choose the right model**: Relational for structured data with
  relationships and constraints. Document for flexible schemas and
  nested data. Time-series for event logs, metrics, and sensor data.
  Mix models per table based on access patterns — this is the primary
  advantage of SpacetimeDB over single-model databases.
- **Temporal queries are not free**: AS OF queries access historical
  data. Keep retention windows bounded (configure `history_retention`).
- **Indexes**: Create B-tree indexes for equality and range queries on
  relational columns. Create GIN indexes for JSONB containment queries.
- **Partitioning**: Use hash partitioning for even distribution across
  shards. Use range partitioning (by `created_at` or similar) for
  time-series tables to enable partition pruning.
- **Connections**: Use connection pooling even though SpacetimeDB
  handles connections efficiently. Pool size `(2 × CPU)` is a starting
  point.
- **Migrations**: SpacetimeDB supports online DDL for most changes.
  Test schema migrations in a staging environment first. Use the
  migration tool (`spacetime migrate`) for versioned schema changes.
- **Monitoring**: Track query latency (p50/p95/p99), connection pool
  utilisation, shard imbalance, and temporal storage growth.
- **Backups**: Use `spacetime export` for logical backups. Configure
  point-in-time recovery (PITR) with retention window matching your
  recovery SLAs.

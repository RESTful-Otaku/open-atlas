# Cassandra Skill

Loaded when the project uses Apache Cassandra. Supplements `rules/sql.md`
with Cassandra-specific patterns.

---

## Setup

- **Start**: `docker run -d --name cassandra cassandra:5.0`
- **Client**: `cqlsh` (CQL shell)
- **Driver**: `cassandra-driver` (Python, Node, Java), `scylla` driver for
  Rust / Go
- **Keyspace**: Analogous to a database. You must create one before tables.

## Key Differences from Relational SQL

Cassandra is a wide-column NoSQL database designed for write-heavy,
high-availability workloads. CQL looks like SQL but has vastly different
constraints:

| Aspect | Cassandra | Postgres / MySQL |
|--------|-----------|-------------------|
| Joins | Not supported (denormalise) | Supported |
| Transactions | Only within a single partition | Full ACID |
| ORDER BY | Only within a partition | Any column |
| Secondary indexes | Limited, expensive | Full support |
| Consistency | Tunable (ONE, QUORUM, ALL) | Strong by default |
| Schema changes | Online, but with caveats | Varies |

## Data Modelling

### Rule: Model by Query

Cassandra data modelling is the inverse of relational: start with the
queries you need, then design the table.

```sql
-- Query: Get recent orders by user (sorted by time)
CREATE TABLE orders_by_user (
    user_id    UUID,
    order_id   UUID,
    total      DECIMAL,
    created_at TIMESTAMP,
    PRIMARY KEY (user_id, created_at, order_id)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- Query: Get order details by order_id
CREATE TABLE orders_by_id (
    order_id   UUID PRIMARY KEY,
    user_id    UUID,
    total      DECIMAL,
    status     TEXT,
    created_at TIMESTAMP
);
```

### When to Denormalise

- Duplicate data across tables for different access patterns. This is
  expected in Cassandra, not a design smell.
- Use batch statements to keep denormalised copies consistent:
  ```sql
  BEGIN BATCH
    INSERT INTO orders_by_user (...) VALUES (...);
    INSERT INTO orders_by_id (...) VALUES (...);
  APPLY BATCH;
  ```
  Batches should operate on a single partition when possible.

### Primary Key Structure

```sql
PRIMARY KEY ((partition_key), clustering_column_1, clustering_column_2)
--            ^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
--            determines node   determines sort order within partition
```

- **Partition key**: Choose for even data distribution. High-cardinality
  columns (user_id, device_id). Avoid monotonically increasing keys
  (timestamp alone) — they create hot spots.
- **Clustering columns**: Define sort order. Include enough columns for
  uniqueness.

## Conventions

- **No joins**: Design tables so each query reads from one table. Join at
  the application layer if needed.
- **No `ALLOW FILTERING`** in production queries — it scans all partitions.
  Design a table for every access pattern.
- **Lightweight transactions** (`IF NOT EXISTS`, `IF`) for conditional
  writes. Use sparingly — they have a performance cost (Paxos).
- **Time-to-live (TTL)**: Cassandra can auto-expire data:
  ```sql
  INSERT INTO events (id, data) VALUES (1, '...') USING TTL 86400;
  ```
- **Materialised views**: Available but have known limitations. Prefer
  application-level denormalisation over MV for new projects.
- **Compaction**: Size-tiered (STCS) for write-heavy workloads.
  Leveled (LCS) for read-heavy. Time-window (TWCS) for time-series.
  Configure per table.
- **Consistency level**: `LOCAL_QUORUM` for most operations.
  `LOCAL_ONE` for non-critical reads. Avoid `EACH_QUORUM`.
- **Schema migration**: Use a tool like `cassandra-migration` or
  Cassandra's own `ALTER TABLE` (add/drop columns is online). Drop
  columns carefully — data is not reclaimed immediately.
- **Monitoring**: Track `read_latency`, `write_latency`, `compaction`
  backlog, dropped mutations. Use `nodetool` for diagnostics.
- **Backups**: `nodetool snapshot` for incremental backups. Store
  snapshots off-node.

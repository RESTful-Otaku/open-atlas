# PostgreSQL Skill

Loaded when the project uses PostgreSQL. Supplements `rules/sql.md` with
Postgres-specific patterns.

---

## Setup

- **Connect**: `psql -U <user> -d <db>`
- **Dump**: `pg_dump -U <user> <db> > dump.sql`
- **Restore**: `psql -U <user> -d <db> < dump.sql`
- **Container**: `docker run -e POSTGRES_PASSWORD=pass postgres:17-alpine`

## Recommended Extensions

| Extension | Use |
|-----------|-----|
| `pgcrypto` | `gen_random_uuid()`, cryptographic functions |
| `uuid-ossp` | UUID generation (older alternative to pgcrypto) |
| `citext` | Case-insensitive text type |
| `pg_trgm` | Trigram text search (LIKE optimisation, fuzzy matching) |
| `ltree` | Hierarchical / tree data |
| `postgis` | Geospatial data and queries |
| `hstore` | Key-value store within a column |

## Code Patterns

### Schema Design

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE INDEX idx_users_created_at ON users (created_at);
```

### Query Patterns

```sql
-- Upsert
INSERT INTO users (id, name, email)
VALUES ('abc', 'Alice', 'alice@example.com')
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = now();

-- Pagination with cursor (keyset pagination)
SELECT id, name, created_at
FROM users
WHERE created_at < $1
ORDER BY created_at DESC
LIMIT 50;

-- JSON querying (when using JSONB columns)
SELECT id, data->>'name' AS name
FROM events
WHERE data @> '{"type": "purchase"}';
```

### Full-Text Search

```sql
-- Add tsvector column for search
ALTER TABLE articles ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED;

CREATE INDEX idx_articles_search ON articles USING GIN(search_vector);

-- Query
SELECT title FROM articles
WHERE search_vector @@ plainto_tsquery('english', 'search terms')
ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'search terms')) DESC;
```

## Conventions

- **Primary keys**: `UUID` over `SERIAL` / `BIGSERIAL` for distributed
  systems and to avoid enumeration attacks. `BIGSERIAL` is acceptable
  for single-server apps where sequential IDs are not a security concern.
- **Timestamps**: `TIMESTAMPTZ` (TIMESTAMP WITH TIME ZONE) always. Store
  in UTC, convert for display. Never `TIMESTAMP` without timezone.
- **Indexing**: Index columns used in `WHERE`, `JOIN`, `ORDER BY`.
  Partial indexes for filtered queries:
  ```sql
  CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';
  ```
- **Migrations**: Use a migration tool (Flyway, `sqlx migrate`,
  `diesel migration`, `node-pg-migrate`). Not raw SQL applied manually.
- **Connection pooling**: PgBouncer in transaction mode for production.
   Start with pool size = `2 × CPU cores`, monitor connection wait
   time, increase by 25% if contention is observed.
- **Monitoring**: Track `pg_stat_activity`, `pg_stat_statements`,
  and slow query logs. Set `log_min_duration_statement = 1000` (1s).
- **Vacuum**: Autovacuum is on by default. Monitor `pg_stat_user_tables`
  for `n_dead_tup` > 20% of live tuples.
- **Backups**: `pg_dump` for logical backups, `pg_basebackup` for
  physical / point-in-time recovery. Test restores regularly.

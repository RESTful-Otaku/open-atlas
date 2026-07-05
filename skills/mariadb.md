# MariaDB Skill

Loaded when the project uses MariaDB. Supplements `rules/sql.md` with
MariaDB-specific patterns.

---

## Setup

- **Connect**: `mysql -u <user> -p <db>`
- **Dump**: `mariadb-dump -u <user> <db> > dump.sql`
- **Restore**: `mysql -u <user> -d <db> < dump.sql`
- **Container**: `docker run -e MARIADB_ROOT_PASSWORD=pass mariadb:11`

## MariaDB vs MySQL

MariaDB is a fork of MySQL with additional features. For most purposes,
they are interchangeable. Key MariaDB advantages:

| Feature | MariaDB | MySQL (Oracle) |
|---------|---------|----------------|
| ENGINE | Many choices, InnoDB default | InnoDB default |
| Sequences | Native `SEQUENCE` | No (auto-increment only) |
| JSON | `JSON` type (alias for `LONGTEXT` + CHECK) | Native JSON type |
| WITH (CTE) | Yes (recursive) | Yes (recursive) |
| Window functions | Yes | Yes (8.0+) |
| System-versioned tables | Yes | Generated columns workaround |

## Code Patterns

### Schema Design

```sql
CREATE TABLE users (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid       CHAR(36) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_uuid (uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### JSON Queries

```sql
-- MariaDB supports JSON via JSON functions
SELECT id, JSON_EXTRACT(data, '$.name') AS name
FROM events
WHERE JSON_EXTRACT(data, '$.type') = 'purchase';

-- You can create a virtual index on JSON paths
ALTER TABLE events
    ADD COLUMN event_type VARCHAR(50) AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.type'))) VIRTUAL,
    ADD INDEX idx_event_type (event_type);
```

### Sequences (MariaDB-specific)

```sql
CREATE SEQUENCE order_seq START WITH 1000 INCREMENT BY 1;
SELECT NEXTVAL(order_seq);
-- Use in INSERT:
INSERT INTO orders (id, ...) VALUES (NEXTVAL(order_seq), ...);
```

## Conventions

- **Engine**: Always `ENGINE=InnoDB` in production. MyISAM is read-only
  acceptable only for data warehouse tables. Aria for temporary tables.
- **Charset**: `utf8mb4` with `utf8mb4_unicode_ci` collation. The old
  `utf8` is not real UTF-8 — it lacks 4-byte characters (emojis).
- **Connection pooling**: MariaDB's `max_connections` default is 150.
  Use a connection pooler (MariaDB MaxScale, ProxySQL) for production.
   Start with pool size = `2 × CPU cores`, monitor connection wait
   time, increase by 25% if contention is observed.
- **Backup**: `mariadb-dump --single-transaction` for consistent backups
  without locking InnoDB tables (uses MVCC). `mariabackup` for hot
  physical backups.
- **Replication**: Asynchronous by default. Semi-synchronous for better
  durability. Use MariaDB MaxScale for read-write splitting.
- **Monitor**: `SHOW FULL PROCESSLIST`, `SHOW ENGINE INNODB STATUS`,
  slow query log (`SET GLOBAL slow_query_log = ON`).
- **Partitioning**: Available but use judiciously. Partition pruning
  helps large tables. Indexing is often more effective than partitioning
  for typical query patterns.
- **No `SELECT *` in production code** — always name columns explicitly.
- **No triggers or stored procedures for business logic** — they're hard
  to version, test, and debug. Use them only for cross-cutting concerns
  (audit logging, constraints that can't be expressed in DDL).

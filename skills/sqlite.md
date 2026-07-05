# SQLite Skill

Loaded when the project uses SQLite. Supplements `rules/sql.md` with
SQLite-specific patterns.

---

## Setup

- **Driver**: Built-in in many languages. `bun:sqlite` (Bun),
  `better-sqlite3` (Node), `rusqlite` (Rust), `sqlite3` (Python built-in).
- **Backup**: `.backup` command in CLI, or `VACUUM INTO 'backup.db'`.

## Key Differences from Other SQL Databases

| Feature | SQLite | Postgres / MySQL |
|---------|--------|-------------------|
| Concurrency | WAL mode for concurrent reads / 1 writer | Full MVCC |
| Data types | Flexible / manifest typing | Strict typing |
| ALTER TABLE | Limited (can't DROP column, can't alter constraints) | Full DDL |
| FOREIGN KEY | Must be enabled via `PRAGMA foreign_keys = ON` | Enabled by default |
| Full-text search | Built-in FTS5 extension | Separate extension |
| JSON | `json_extract()` etc. | Native JSON type |
| User management | None (file-based) | Roles, permissions |
| Replication | None built-in | Streaming replication |

## Configuration

```sql
-- Always enable these at connection start
PRAGMA journal_mode = WAL;            -- better concurrent read performance
PRAGMA foreign_keys = ON;             -- enforce FK constraints
PRAGMA busy_timeout = 5000;           -- wait 5s before locking error
PRAGMA synchronous = NORMAL;          -- balance safety/speed (WAL mode)
```

## Code Patterns

### Connection (Node — better-sqlite3)

```typescript
import Database from 'better-sqlite3';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function getUser(id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | User
    | undefined;
}

// Transactions
export function transfer(fromId: string, toId: string, amount: number) {
  db.transaction(() => {
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
      .run(amount, fromId);
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
      .run(amount, toId);
  })();
}
```

### Full-Text Search (FTS5)

```sql
CREATE VIRTUAL TABLE users_fts USING fts5(name, email, content='users');

-- Query
SELECT * FROM users_fts WHERE users_fts MATCH 'alice';
```

## When to Use SQLite

| Good fit | Poor fit |
|----------|----------|
| Embedded / desktop apps | High-concurrency web apps (> 100 writes/s) |
| Mobile apps (via OS library) | Multi-server deployments |
| Development / test databases | sharding / horizontal scaling |
| Read-heavy workloads | Write-heavy workloads |
| Prototypes, small tools | > 50 GB datasets |
| Edge / serverless | Need row-level security or replication |

## Migration Strategy

SQLite has limited ALTER TABLE. Use this pattern for destructive changes:

```sql
-- 1. Create new table
CREATE TABLE users_new (id TEXT PRIMARY KEY, name TEXT NOT NULL);

-- 2. Copy data
INSERT INTO users_new (id, name) SELECT id, name FROM users;

-- 3. Swap
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
```

Wrap in a transaction when possible. This is safe but blocks writes
during the swap.

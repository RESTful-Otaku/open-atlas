# SQL Skill

Loaded when the project uses SQL. Supplements `rules/conventions.md` with
SQL-specific patterns.

**Also load** the specific database skill: `postgres.md`, `sqlite.md`,
`mariadb.md`, `cassandra.md`, `spacetime-db.md`, `oracle.md`.

---

## Conventions

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | `snake_case` plural | `users`, `order_items` |
| Columns | `snake_case` singular | `user_id`, `created_at` |
| Primary key | `id` | `id BIGSERIAL PRIMARY KEY` |
| Foreign key | `<referenced_table>_id` | `user_id` |
| Indexes | `idx_<table>_<column>` | `idx_users_email` |
| Unique constraints | `uq_<table>_<column>` | `uq_users_email` |
| Join tables | `<table1>_<table2>` | `user_roles` |

### Query Style

```sql
-- Capitalise keywords, lowercase identifiers
SELECT u.id,
       u.name,
       o.total
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.active = true
  AND o.created_at >= '2026-01-01'
ORDER BY u.name ASC;
```

- **Keywords**: UPPERCASE (`SELECT`, `FROM`, `WHERE`, `JOIN`, `INSERT`,
  `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`).
- **Identifiers**: lowercase `snake_case`.
- **Explicit columns** over `SELECT *` — always. `SELECT *` is a
  maintenance hazard (column order changes, unused data transfer).
- **Table aliases**: Short, meaningful (`u` for `users`, `oi` for
  `order_items`). Avoid single-character aliases unless the query is
  trivial.
- **CTEs** over subqueries for readability. Every CTE should describe
  one logical step:
  ```sql
  WITH active_users AS (
    SELECT id, name FROM users WHERE active = true
  ),
  recent_orders AS (
    SELECT user_id, total FROM orders WHERE created_at >= '2026-01-01'
  )
  SELECT u.name, COUNT(o.*) AS order_count
  FROM active_users u
  LEFT JOIN recent_orders o ON o.user_id = u.id
  GROUP BY u.id, u.name;
  ```

### Transactions

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- or ROLLBACK on error
```

- Every logical unit of work that touches multiple rows/tables must be
  wrapped in a transaction.
- Keep transactions short. Do not hold transactions open across HTTP
  requests or user input.

### Migrations

- One file per change, numbered sequentially or timestamped.
- Each migration must be reversible (have a `down` script).
- Migrations are immutable once applied. Never edit a committed migration.
  Create a new one to reverse or amend.
- Test migrations against a copy of production data before deploying.
- Name: `YYYYMMDDHHMMSS_description.sql` or `V001__description.sql`.

### Security

- **Parameterised queries**: Always. Never interpolate user input into
  SQL strings:
  ```python
  # Good
  cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
  # Bad
  cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
  ```
- **Least privilege**: Application DB user should have only the
  permissions it needs (`SELECT`, `INSERT`, `UPDATE`, `DELETE` on
  specific tables). No `CREATE`, `DROP`, `ALTER` in production.
- **Row-level security** (RLS) for multi-tenant data when the DB supports
  it (Postgres, SQL Server).

# MongoDB Skill

Loaded when the project uses MongoDB. Supplements `rules/conventions.md`
with MongoDB-specific patterns.

---

## Setup

- **Start**: `mongod --dbpath /data/db`
- **Container**: `docker run -d -p 27017:27017 mongo:7`
- **Shell**: `mongosh`
- **Driver**: `mongodb` (Node/Python), `mongodb` (Rust), `go.mongodb.org/mongo-driver` (Go)

## Data Modelling

### Document Design

```javascript
// Good — embedded for tightly coupled, read-together data
{
  _id: ObjectId("..."),
  name: "Alice",
  email: "alice@example.com",
  address: {              // embedded — always read with user
    street: "123 Main St",
    city: "Portland",
    zip: "97201"
  },
  recent_orders: [        // limited embedded array (< 100 items)
    { order_id: "...", total: 50, date: ISODate("...") }
  ]
}

// Separate collection for orders (many-to-one, independently queried)
// db.orders
{
  _id: ObjectId("..."),
  user_id: ObjectId("..."),  // reference by _id
  total: 50,
  items: [/* ... */],
  created_at: ISODate("...")
}
```

### When to Embed vs Reference

| Embed | Reference |
|-------|-----------|
| Data read together always | Data accessed independently |
| One-to-few (< 100 items) | One-to-many (unbounded) |
| Data updated together | Data updated independently |
| No need to query the embedded data alone | Need to query the related collection alone |

### Indexing Strategy

```javascript
// Single field
db.users.createIndex({ email: 1 }, { unique: true });

// Compound — supports queries that filter on all prefix fields
// This index supports: { status: "active" }, { status: "active", created_at: ... }
db.orders.createIndex({ status: 1, created_at: -1 });

// Text index for search
db.articles.createIndex({ title: "text", body: "text" });

// TTL index — auto-expire documents
db.sessions.createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 });
```

## Query Patterns

```javascript
// Aggregation pipeline
db.orders.aggregate([
  { $match: { status: "completed", created_at: { $gte: startDate } } },
  { $group: { _id: "$user_id", total_spent: { $sum: "$total" } } },
  { $sort: { total_spent: -1 } },
  { $limit: 10 },
  { $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "user"
  }}
]);

// Bulk writes
const bulk = db.users.initializeUnorderedBulkOp();
bulk.find({ _id: "abc" }).updateOne({ $set: { name: "Alice" } });
bulk.find({ _id: "xyz" }).updateOne({ $set: { name: "Bob" } });
bulk.execute();
```

## Conventions

- **Schema validation**: Enforce at the application or database level.
  MongoDB supports JSON Schema validation since v3.6:
  ```javascript
  db.createCollection("users", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["name", "email"],
        properties: {
          name: { bsonType: "string" },
          email: { bsonType: "string", pattern: "^[^@]+@[^@]+$" },
        }
      }
    }
  });
  ```
- **_id**: Let MongoDB generate ObjectId by default. Use UUID strings
  only if cross-system compatibility requires it. ObjectId is smaller
  (12 bytes vs 36) and embeds a timestamp.
- **No unbounded arrays**: Arrays that grow without limit cause
  document relocation and performance degradation. Cap at ~100 items.
  Use a separate collection for unbounded one-to-many.
- **Projections**: Always specify which fields to return:
  ```javascript
  db.users.findOne({ _id: id }, { projection: { name: 1, email: 1 } });
  ```
- **No `$where`**: Avoid JavaScript evaluation in queries — slow and
  prevents index use.
- **Connection pooling**: Use the driver's built-in pool. Min/max pool
  size based on workload. Default (100 in Node driver) is usually fine.
- **Write concern**: `w: majority` for critical data. `w: 1` for
  non-critical. Journal: `j: true` for durability.
- **Read concern**: `"majority"` for consistent reads. `"local"` for
  tolerance of stale data.
- **Backups**: `mongodump` for logical backups, Ops Manager / Atlas
  for continuous backups. Test restore procedure regularly.
- **No joins** (well, `$lookup` exists but is slow): Design documents
  to minimise `$lookup` in hot paths. Denormalise where acceptable.

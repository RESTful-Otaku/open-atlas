# JSON Skill

Loaded when the project works with JSON (API payloads, configuration
files, data serialisation). Supplements `rules/conventions.md` with
JSON-specific patterns.

---

## Conventions

- **Double quotes only**: JSON requires `"` for strings and keys. Single
  quotes and backticks are not valid JSON.
- **Trailing comma**: Not allowed in JSON. Strips before parsing if coming
  from human-edited files.
- **No comments**: JSON has no comment syntax. If comments are needed,
  use a pre-processor that strips them, or switch to JSON5/YAML for
  config files.
- **Snake_case keys** for consistency across languages. `camelCase` is
  also widely used in JavaScript ecosystems. Pick one per project and
  document it:

  ```json
  { "user_id": 42, "user_name": "Alice" }
  ```

  If the API must serve both frontend and backend conventions, use a
  serialisation layer (serde `#[serde(rename_all = "camelCase")]`,
  `@JsonProperty` in Jackson, `json.encoder` in Go).

- **Numbers**: Prefer integers for IDs and counts. Use strings for
  large numbers (beyond `Number.MAX_SAFE_INTEGER` = 9,007,199,254,740,991)
  or fixed-precision monetary values:

  ```json
  { "user_id": 42, "account_balance": "100.50" }
  ```

- **Null handling**: Include `null` fields only when the field is
  meaningful and absent (= null) vs not applicable (= omit key).
  Document the difference:

  ```json
  {
    "email": null,        // user has no email (valid state)
    "phone": "..."        // user has a phone
    // "deleted_at": absent  // user has never been deleted
  }
  ```

- **Error response shape** — consistent across all endpoints:

  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Name is required",
      "details": { "field": "name" }
    }
  }
  ```

- **Pagination** — cursor-based over offset-based:

  ```json
  {
    "data": [/* ... */],
    "cursor": "eyJpZCI6NDJ9",
    "has_more": true
  }
  ```

- **Dates**: ISO 8601 / RFC 3339. Always include timezone: `2026-07-05T14:30:00Z`
  or `2026-07-05T14:30:00+02:00`.

## Tools

| Tool | Use |
|------|-----|
| `jq` | Query and transform JSON from the command line |
| `dasel` | Similar to `jq` with support for YAML, TOML, XML |
| `jsonlint` | Validate JSON syntax |
| `ajv` | Validate JSON against JSON Schema |
| `quicktype` | Generate types from JSON samples |

## Validation with JSON Schema

When JSON is consumed by other services or stored long-term, define a
schema to validate structure and constraints:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "email"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": false
}
```

## Performance

- **Streaming**: For large JSON payloads (> 100 MB), use streaming parsers
  (simdjson in Rust/C++, `ijson` in Python, `JSON.parse` streaming in Node)
  over loading the full document into memory.
- **Schema validation at boundaries**: Validate incoming JSON at the API
  boundary, not inside domain logic. Early rejection prevents deep error
  propagation.
- **Binary alternatives**: Consider MessagePack or CBOR for high-throughput
  internal services where JSON parsing is a bottleneck.

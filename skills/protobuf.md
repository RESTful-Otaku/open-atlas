# Protocol Buffers Skill

Loaded when the project uses Protocol Buffers (protobuf) for serialisation,
RPC schemas (gRPC), or event contracts. Supplements `rules/conventions.md`
with protobuf-specific patterns.

---

## Project Setup

- **Buf CLI**: `buf generate`, `buf lint`, `buf breaking`
- **protoc**: `protoc --proto_path=... --go_out=...`
- **Go**: `protoc-gen-go`, `protoc-gen-go-grpc`
- **TypeScript**: `protoc-gen-ts`, `protoc-gen-es` (from buf)
- **Python**: `grpcio-tools` (provides `python -m grpc_tools.protoc`)
- **Rust**: `tonic-build` (from `Cargo.toml` build script)


## Directory Layout

```
proto/
├── buf.yaml              # Buf module config
├── buf.lock              # Auto-generated dependency lock
└── yourcompany/
    └── pkg/
        ├── v1/
        │   ├── service.proto
        │   └── message.proto
        └── v2/
            └── ...
gen/                      # Generated code (gitignored or committed per policy)
```

## Conventions

### Naming

- **Files**: `snake_case.proto`
- **Package**: `reverse.domain.package.version` — `yourcompany.pkg.v1`
- **Messages**: PascalCase — `CreateUserRequest`
- **Fields**: snake_case — `user_id`, `created_at`
- **Enums**: PascalCase — `Status`. Enum values: `STATUS_UNSPECIFIED`,
  `STATUS_ACTIVE`, `STATUS_INACTIVE` (prefix with enum name or package).
- **Services**: PascalCase — `UserService`
- **RPCs**: PascalCase — `CreateUser`

### Message Structure

```protobuf
syntax = "proto3";

package yourcompany.pkg.v1;

// Field 1-15: most frequently set fields (1 byte wire overhead)
// Field 16-2047: less frequent fields (2 byte overhead)
message CreateUserRequest {
  string email = 1;
  string name = 2;
  UserRole role = 3;
}

message CreateUserResponse {
  string user_id = 1;
}

enum UserRole {
  USER_ROLE_UNSPECIFIED = 0;
  USER_ROLE_ADMIN = 1;
  USER_ROLE_MEMBER = 2;
}
```

- **Field numbers**: 1-15 for hot fields, 16+ for cold, 19000-19999 reserved
  by protobuf. Never reuse a deleted field number — mark it `reserved`.
- **Zero value default**: proto3 defaults all fields to zero/empty. The first
  enum value MUST be `UNSPECIFIED = 0` to catch unset enums.
- **`optional`**: Use for nullable primitives (int, bool, string) to
  distinguish unset from zero:
  ```protobuf
  optional int32 age = 1;  // unset → None, not 0
  ```
- **`wrappers.proto`**: Prefer `optional` over `google.protobuf.StringValue`
  etc. — they add pointer overhead for marginal benefit.
- **`google.type`/`google.protobuf`**: Use well-known types for money,
  date, timestamp, duration instead of raw strings:
  ```protobuf
  import "google/type/money.proto";
  import "google/protobuf/timestamp.proto";

  message Order {
    google.type.Money total = 1;
    google.protobuf.Timestamp created_at = 2;
  }
  ```

### Service Design

```protobuf
service UserService {
  // Unary
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  // Server streaming
  rpc ListUsers(ListUsersRequest) returns (stream User);
  // Bidirectional streaming
  rpc SyncUsers(stream SyncRequest) returns (stream SyncResponse);
}
```

- **Unary by default**. Streaming adds complexity — use it only for:
  large result sets, real-time updates, or large uploads with back-pressure.
- **Error codes**: Use gRPC standard codes (`NOT_FOUND`, `INVALID_ARGUMENT`,
  etc.). Do not define custom error codes in proto — use `google.rpc.Status`
  in response bodies for details when needed.
- **Idempempotency**: Document which RPCs are idempotent in comments.
  Use `google.api.HttpRule` annotation for HTTP transcoding.

### Breaking Changes (Prevent via `buf breaking`)

| Safe | Breaking |
|------|----------|
| Adding a new field | Removing a field |
| Adding a new RPC | Removing or renaming an RPC |
| Adding a new enum value | Removing an enum value |
| Extending a `oneof` | Changing field type or number |
| Adding a new service | Renaming package, message, service |

Use `buf breaking --against .git` to check for breaking changes in CI.

### Buf Config

```yaml
# proto/buf.yaml
version: v2
modules:
  - path: .
lint:
  use:
    - DEFAULT
  except:
    - PACKAGE_VERSION_SUFFIX  # opt-in to v1/v2 suffix style
    - FIELD_NOT_REQUIRED      # proto3 has no required fields
breaking:
  use:
    - FILE
```

### Code Generation

```sh
# One-time setup
buf mod init

# Generate from all proto files
buf generate

# Lint
buf lint

# Check breaking changes against main
buf breaking --against https://github.com/your/repo.git#branch=main
```

### gRPC-Web / Connect

- For browser clients, prefer **Connect-Web** protocol (supports unary natively
  without a proxy) over gRPC-Web + Envoy.
- Use `buf`'s `connect` plugin for TypeScript generation.

### Cross-References

- Load `skills/typescript.md`, `skills/rust.md`, `skills/golang.md` for
  language-specific generated code conventions.
- See `skills/github-actions.md` for CI integration with `buf lint` and
  `buf breaking`.

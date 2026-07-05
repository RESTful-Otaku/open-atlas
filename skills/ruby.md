# Ruby / Rails Skill

Loaded when the project uses Ruby and/or Rails. Supplements
`rules/conventions.md` with Ruby-specific patterns.

---

## Project Setup

- **Init**: `rails new <name> --api` (API) or `rails new <name>` (full stack)
- **Gem**: `gem install <name>`, add to `Gemfile`
- **Bundle**: `bundle install`
- **Test**: `bundle exec rspec` or `rails test`
- **Lint**: `rubocop -A`
- **Format**: `rubocop -A` (auto-fix) or `standardrb --fix`
- **Console**: `rails c` or `irb`
- **DB migrate**: `rails db:migrate`
- **Generate**: `rails g model User name:string email:string`

## Project Structure (Rails)

```
app/
├── controllers/       # request handling
├── models/            # business logic + persistence
├── services/          # orchestration (Rails convention over core)
├── serializers/       # response formatting
├── contracts/         # input validation schemas
├── lib/               # reusable modules
└── jobs/              # background jobs
config/
├── routes.rb
├── database.yml
└── initializers/
db/
├── migrate/
└── seeds.rb
spec/                  # or test/
├── models/
├── requests/
└── support/
```

## Code Patterns

### Error Handling — Custom Exception Classes

```ruby
class AppError < StandardError
  attr_reader :code, :details

  def initialize(code:, message: nil, details: {})
    @code = code
    @details = details
    super(message || code.to_s.humanize)
  end
end

class NotFoundError < AppError
  def initialize(resource, id)
    super(code: :not_found, message: "#{resource} '#{id}' not found")
  end
end
```

### Result Pattern (dry-monads or custom)

```ruby
# Using dry-monads
include Dry::Monads[:result]

def find_user(id)
  user = User.find_by(id: id)
  user ? Success(user) : Failure(:not_found)
end
```

### Service Object Pattern

```ruby
class CreateUser
  include Dry::Monads[:result]

  def call(input)
    user = User.new(input)
    if user.save
      Success(user)
    else
      Failure(user.errors)
    end
  end
end
```

## Conventions

- **Naming**: `snake_case` for methods, variables, and files. `PascalCase`
  for classes and modules. `SCREAMING_SNAKE_CASE` for constants.
- **2-space indentation**. No tabs.
- **No `;`** to separate statements. One statement per line.
- **`map`/`each`/`select`** over manual `for` loops.
- **Safe navigation**: `user&.name` over `user && user.name`.
- **`yield`** blocks over `Proc`/`lambda` for simple callbacks.
- **Rails-specific**:
  - Fat model, thin controller is outdated. Prefer service objects for
    business logic.
  - Validations in models, callbacks only for cross-cutting concerns (audit,
    indexing).
  - Scopes as class methods, not `scope` DSL.
  - No `rescue_from` in controllers for domain errors — handle explicitly.
- **`frozen_string_literal: true`** magic comment at top of every file.
- **Tests**: RSpec over Minitest for Rails projects. Use `let`, `subject`,
  `context`, `describe`. FactoryBot for test data.
- **Avoid**:
  - Monkey-patching core classes.
  - `method_missing` for anything but true DSLs.
  - `eval`/`class_eval` with user input.
  - Overriding `method_missing` without also overriding `respond_to_missing?`.

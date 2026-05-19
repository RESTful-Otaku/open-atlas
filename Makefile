# OpenAtlas — thin wrappers around ./dev.sh (single source of truth).
# Override ingest mode: make up INGEST_MODE=sim
#
#   make up      Start SpacetimeDB + hybrid ingest + LLM bridge
#   make down    Stop everything
#   make run     up + Vite dev server (blocking)
#   make web     Vite only (stack must be up)
#   make test    fmt + clippy + unit tests
#   make build   module + web dist + release binaries
#   make verify  test + subscription SQL + runtime health (if stack up)
#   make verify-full   + prove-live (+ prove-llm if Ollama up)

.PHONY: help up down run web test build verify verify-full clean status logs init-config

INGEST_MODE ?= hybrid
export OPENATLAS_INGEST_MODE := $(INGEST_MODE)

help:
	@./dev.sh help

init-config:
	@./dev.sh init-config

up:
	@./dev.sh up

down:
	@./dev.sh down

run:
	@./dev.sh run

web:
	@./dev.sh web

test:
	@./dev.sh test

build:
	@./dev.sh build

verify:
	@./dev.sh verify

verify-full:
	@./dev.sh verify --full

clean:
	@./dev.sh clean:force

status:
	@./dev.sh status

logs:
	@./dev.sh logs

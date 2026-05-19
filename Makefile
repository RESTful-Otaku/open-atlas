# OpenAtlas — thin wrappers around ./dev.sh (single source of truth).
#
# Quick start (full stack = STDB + ingest + Vite + opens browser):
#   make run              Local hybrid (default)
#   make run-local-sim    Local STDB + sim + Vite
#   make up               Same as run (full stack)
#   make web              Vite only (Advanced — backend must be up)
#   make down             Stop everything
#
# Override ingest mode for `make up`: make up INGEST_MODE=sim

.PHONY: help up down run run-local-sim run-local-live run-local-hybrid \
	run-cloud-sim run-cloud-live web web-cloud web-demo test build verify \
	verify-full clean status logs init-config up-sim up-live up-cloud-sim up-cloud-live

INGEST_MODE ?= hybrid
export OPENATLAS_INGEST_MODE := $(INGEST_MODE)

help:
	@./dev.sh help

init-config:
	@./dev.sh init-config

up:
	@./dev.sh up

up-sim:
	@./dev.sh up:sim

up-live:
	@./dev.sh up:live

up-cloud-sim:
	@./dev.sh up:cloud:sim

up-cloud-live:
	@./dev.sh up:cloud:live

down:
	@./dev.sh down

run:
	@./dev.sh run

run-local-sim:
	@./dev.sh run:local:sim

run-local-live:
	@./dev.sh run:local:live

run-local-hybrid:
	@./dev.sh run:local:hybrid

run-cloud-sim:
	@./dev.sh run:cloud:sim

run-cloud-live:
	@./dev.sh run:cloud:live

web:
	@./dev.sh web

web-cloud:
	@./dev.sh web:cloud

web-demo:
	@./dev.sh web:demo

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

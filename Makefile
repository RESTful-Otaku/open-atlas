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
	verify-full clean status logs init-config up-sim up-live up-cloud-sim up-cloud-live \
	replay-test mobile-run mobile-doctor mobile-setup mobile-build mobile-android mobile-android-release \
	mobile-dev mobile-ios

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

replay-test:
	@./scripts/replay-fixture.sh

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

mobile-run:
	@./dev.sh mobile:run

mobile-doctor:
	@./dev.sh mobile:doctor

mobile-setup:
	@./dev.sh mobile:setup

mobile-build:
	@./dev.sh mobile:build

mobile-android:
	@./dev.sh mobile:android

mobile-android-release:
	@./dev.sh mobile:android:release

mobile-apk-maincloud:
	@OPENATLAS_MOBILE_TARGET=maincloud OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1 ./scripts/mobile-build-apk.sh

# Physical phone: all deployment modes via Settings → Deployment (flex operator APK)
mobile-apk-flex:
	@OPENATLAS_MOBILE_TARGET=flex OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-apk.sh
	@cp -f dist/mobile/openatlas-flex-release-unsigned.apk dist/mobile/openatlas-release.apk

mobile-dev:
	@./dev.sh mobile:dev

mobile-run-maincloud:
	@./dev.sh run-android:maincloud

mobile-run-local:
	@./dev.sh run-android:local

mobile-ios:
	@./dev.sh mobile:ios

mobile-ios-maincloud:
	@OPENATLAS_MOBILE_TARGET=maincloud OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1 ./scripts/mobile-build-ios.sh

mobile-ios-release:
	@OPENATLAS_MOBILE_TARGET=maincloud OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1 OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-ios.sh

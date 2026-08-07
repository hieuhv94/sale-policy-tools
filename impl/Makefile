# Mọi thứ chạy trong Docker. Không có mục tiêu nào chạy Node native trên máy.
SHELL       := /bin/sh
APP_VERSION := $(shell cat VERSION)
GIT_SHA     := $(shell git rev-parse --short HEAD 2>/dev/null || echo nogit)
export APP_VERSION GIT_SHA

COMPOSE  := docker compose -f deploy/compose.yml -f deploy/compose.test.yml
RUN      := $(COMPOSE) run --rm -T test
WORKSPACE := ../workspace

.PHONY: help up down migrate install typecheck test seed clean ps logs psql version

help:
	@echo "up        dựng hạ tầng (postgres, redis, rabbitmq, minio, mailpit) + migration"
	@echo "install   cài phụ thuộc trong container"
	@echo "test      chạy toàn bộ test trong container"
	@echo "down      dừng và xoá container"
	@echo "clean     xoá luôn volume dữ liệu và thư mục workspace"

up:
	@mkdir -p $(WORKSPACE)/logs $(WORKSPACE)/reports
	$(COMPOSE) up -d --wait postgres redis rabbitmq minio mailpit
	$(COMPOSE) up --exit-code-from migrate migrate

migrate:
	$(COMPOSE) up --exit-code-from migrate migrate

install:
	$(RUN) pnpm install --frozen-lockfile=false --config.store-dir=/pnpm-store

typecheck:
	$(RUN) pnpm typecheck

seed:
	$(RUN) pnpm seed

test:
	@mkdir -p $(WORKSPACE)/reports
	$(RUN) pnpm test

version:
	@echo "APP_VERSION=$(APP_VERSION) GIT_SHA=$(GIT_SHA)"

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs --no-color --tail=200 > $(WORKSPACE)/logs/compose.log 2>&1; \
	echo "đã ghi $(WORKSPACE)/logs/compose.log"

psql:
	$(COMPOSE) exec postgres psql -U postgres -d csbh

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down -v --remove-orphans
	rm -rf $(WORKSPACE)/logs/* $(WORKSPACE)/reports/* $(WORKSPACE)/tmp/*

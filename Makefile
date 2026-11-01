# Shortcuts over tools/build.ts and friends; CI calls these targets, so a local run is the same check.
# Variable docs sit on the line above: an inline comment would leave a trailing space in the value.
## Port `make serve` listens on; on localhost the home page shows mocked star counts
PORT ?= 8765
## Folder `make dev` writes to (default: a new temporary folder)
OUT ?=

# Without pipefail a failing command piped into another reports success.
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

# tools/package.json is the one place bun's version lives: its zlib writes the PNGs, so it must match CI's.
BUN_VERSION := $(shell sed -n 's/.*"packageManager": "bun@\(.*\)".*/\1/p' tools/package.json)
## How to run bun; CI installs the pinned version and sets BUN=bun
BUN ?= bunx bun@$(BUN_VERSION)

.DEFAULT_GOAL := help
.PHONY: help install build check test typecheck lint fmt dev serve screenshots clean

help: ## Show this help
	@awk 'BEGIN { FS = ":.*## " } \
		/^[a-z-]+:.*## / { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST) \
		| { printf "\033[1mUsage:\033[0m make \033[36m<target>\033[0m [\033[33mVAR\033[0m=value]\n\n\033[1mTargets:\033[0m\n"; cat; }
	@awk 'BEGIN { FS = " \\?= ?" } \
		/^## / { doc = substr($$0, 4); next } \
		/^[A-Z_]+ \?=/ && doc { printf "  \033[33m%-12s\033[0m %s \033[2m(default: %s)\033[0m\n", $$1, doc, ($$2 == "" ? "none" : $$2) } \
		{ doc = "" }' $(MAKEFILE_LIST) \
		| { printf "\n\033[1mVariables:\033[0m\n"; cat; }

install: ## Install the build's pinned dependencies (tools/node_modules)
	cd tools && $(BUN) install --frozen-lockfile

build: ## Regenerate every generated file in the repo from tools/projects.jsonc
	$(BUN) tools/build.ts

check: ## Rebuild in memory and compare with the repo; changes nothing, fails on a difference
	$(BUN) tools/build.ts --check

test: ## Run the generator's tests (offline)
	cd tools && $(BUN) test

typecheck: ## Type-check the generator and the site's copy scripts with TypeScript 7
	cd tools && $(BUN) run tsc -p tsconfig.json && $(BUN) run tsc -p tsconfig.site.json

# biome.json sits at the repo root, so these lint the whole repo it lists: tools/ and the copy scripts
lint: ## Lint and format-check the generator and the copy scripts; changes nothing
	cd tools && $(BUN) run biome ci --error-on-warnings ..

fmt: ## Fix formatting and safe lint fixes in the generator and the copy scripts
	cd tools && $(BUN) run biome check --write ..

dev: ## Build with local "readme" entries allowed, into OUT (never the repo)
	$(BUN) tools/build.ts --out "$(or $(OUT),$(shell mktemp -d))"

serve: ## Serve the site at http://localhost:PORT/ to preview a change
	@echo "http://localhost:$(PORT)/"
	python3 -m http.server $(PORT) --bind localhost

screenshots: ## Re-photograph the live site for the install dialog (by hand; needs Chrome and uv)
	tools/share-images/build.sh screenshots

clean: ## Remove the build's installed dependencies
	rm -rf tools/node_modules

# Fixture app

[![CI](https://img.shields.io/badge/ci-passing-green)](https://example.com/ci) A README that uses every feature the
build renders; `test/golden.test.ts` builds it offline and compares every byte.

> [!NOTE]
> An alert, with **bold** and a [relative link](docs/guide.md#start).

Text between two alerts.

> [!CAUTION]
> A second kind.

A footnote[^why] and ~~struck~~ text, and a bare link: https://example.com.

[^why]: Footnotes render at the end.

- [x] a done task
- [ ] a task to do

| Language | Highlighted |
| -------- | ----------- |
| Go       | yes         |
| Clojure  | yes         |

```go
func main() { fmt.Println("hi") }
```

```clojure
(defn greet [name] (str "hi " name))
```

```toml
[tool]
name = "fixture"
```

```mermaid
flowchart LR
  A[README] --> B[page]
  B --> C{card?}
  C -->|yes| D[card.png]
```

```mermaid
sequenceDiagram
  build->>gh: README at the ref
  gh-->>build: markdown
```

![a screenshot](docs/shot.png)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/dark.png">
  <img src="docs/shot.png" alt="themed">
</picture>

<!-- a comment stays -->

## Star History

[![history](https://api.star-history.com/svg?repos=o/app)](https://star-history.com/#o/app)

## Dropped

This section is named in the fixture's drop list.

## Licence

MIT

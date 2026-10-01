# @clinkai/dsh-web-search-fallback

A **SearXNG-first** `web_search` provider for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web capability seam (`ctx.web`) with **automatic fallback to the built-in DeepSeek search** when SearXNG / Docker is unreachable.

It does not replace either backend. It registers one provider (`search-fallback`) that dispatches at call time to the two providers already registered with the seam:

| role      | registered id       | package                          | backend            |
|-----------|---------------------|----------------------------------|--------------------|
| primary   | `searxng`           | `@clinkai/dsh-web-search-searxng`         | SearXNG in Docker  |
| fallback  | `deepseek-official` | `@deepseek-ai/dsh-web-search-deepseek` | DeepSeek API (built-in) |

## When it falls back

- **Connection-level failure** — Docker / SearXNG is down (`ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` …; walks the full `cause` chain).
- **Timeout** — SearXNG hung and the caller did not cancel.
- **HTTP 5xx** — SearXNG is up but the service is failing.

Anything else (a caller cancellation, a 4xx like a bad request, a genuine empty result) is passed through unchanged.

## Decoupled by construction

This plugin never patches DSH source and imports **no DSH-internal export** — the connection-error classifier is inlined, and both backends are reached through the public `ctx.web` provider registry. It loads and falls back even when DSH's own proxy layer is stock/unpatched, and it cannot break DSH: worst case (both backends missing) it throws `WEB_PROVIDER_UNAVAILABLE`, exactly like the seam does without any plugin.

## Install

The package ships a `dsh.bundle.patch`, so installing it is enough: DSH mounts
the provider as a bundle layer and there is nothing to hand-wire.

```sh
# from npm (once published)
dsh plugin --profile web add @clinkai/dsh-web-search-fallback

# straight from GitHub — no registry needed, the built entry is committed
dsh plugin --profile web add github:w384/clinkai-dsh-web-search-fallback

# from a local checkout, or from a packed tarball
dsh plugin --profile web add link:/path/to/clinkai-dsh-web-search-fallback
dsh plugin --profile web add ./clinkai-dsh-web-search-fallback-0.1.0.tgz
```

Then point the seam at the composed provider in
`$DSH_HOME/profiles/<profile>/cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: search-fallback
```

The `searxng` and `deepseek-official` providers must both remain registered (their own plugins), because the fallback provider reads them from the seam registry at call time.

## Behavior

- SearXNG reachable → all searches go through SearXNG (free, self-hosted).
- Docker / SearXNG down → searches transparently use the built-in DeepSeek search.
- Both unreachable → the original error is surfaced (`WEB_PROVIDER_ERROR`).

## License

MIT

import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";

/**
 * SearXNG-first web search with automatic fallback to the built-in DeepSeek
 * search. Registers one provider ("search-fallback") that dispatches at call
 * time to two providers already registered with the web seam:
 *
 *   - primary:  "searxng"            (@clinkai/dsh-web-search-searxng, self-hosted in Docker)
 *   - fallback: "deepseek-official"  (dsh-web-search-deepseek, built-in, API key)
 *
 * If the primary is missing, unreachable (Docker down → connection refused),
 * times out, or fails with an HTTP 5xx, the request is retried against the
 * fallback provider, so web search keeps working even when SearXNG is down.
 *
 * Decoupled by construction: this is a standalone package over the stable
 * `ctx.web` seam and the public provider registry. It never patches DSH source
 * and depends on no DSH-internal export — the connection-error classifier is
 * inlined below, so the plugin loads and falls back even if DSH's own proxy
 * layer is stock/unpatched.
 */

/** Cordis plugin name used by loader diagnostics. */
const name = "@clinkai/dsh-web-search-fallback";

/** The web seam this provider registers into. */
const inject = ["web"];

/** Stable provider id registered with `ctx.web`; pin it via `web.searchProvider`. */
const FALLBACK_PROVIDER_ID = "search-fallback";

/** Registered id of the SearXNG provider (@clinkai/dsh-web-search-searxng). */
const PRIMARY_PROVIDER_ID = "searxng";
/** Registered id of the built-in DeepSeek provider (dsh-web-search-deepseek). */
const BUILTIN_PROVIDER_ID = "deepseek-official";

/** No own configuration: both candidates are configured by their own plugins. */
const Config = z.object({});

/**
 * Connection-level failure codes that mean the backend host itself could not
 * be reached (Docker/SearXNG down), as opposed to a target-side or
 * response-level failure, which the fallback must not mask.
 */
const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET"
]);

/** Walk the full `cause` chain looking for a connect-level failure code. */
function isConnectError(error) {
  const seen = /* @__PURE__ */ new Set();
  for (let current = error; current !== null && current !== void 0; ) {
    if (typeof current === "object" && typeof current.code === "string" && CONNECT_ERROR_CODES.has(current.code)) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = typeof current === "object" ? current.cause : null;
  }
  return false;
}

/**
 * The fallback search provider. `available()` is true while either candidate
 * is usable, so the seam accepts it even when only one backend is up. `search()`
 * tries the primary and, on an "unavailable" failure, retries the fallback.
 */
class FallbackSearchProvider {
  ctx;
  id = FALLBACK_PROVIDER_ID;

  constructor(ctx) {
    this.ctx = ctx;
  }

  provider(id) {
    return this.ctx.web.searchProviders.get(id);
  }

  available() {
    const primary = this.provider(PRIMARY_PROVIDER_ID);
    const fallback = this.provider(BUILTIN_PROVIDER_ID);
    return primary?.available() === true || fallback?.available() === true;
  }

  async search(request, signal) {
    const primary = this.provider(PRIMARY_PROVIDER_ID);
    const fallback = this.provider(BUILTIN_PROVIDER_ID);
    if (primary !== void 0) {
      try {
        return await primary.search(request, signal);
      } catch (error) {
        if (shouldFallback(error, signal) && fallback !== void 0 && fallback.available()) {
          return await fallback.search(request, signal);
        }
        throw error;
      }
    }
    if (fallback !== void 0 && fallback.available()) {
      return await fallback.search(request, signal);
    }
    throw new WebError("no usable web search provider is registered", "WEB_PROVIDER_UNAVAILABLE");
  }
}

/**
 * Whether a primary-provider failure means the backend is "unavailable" and the
 * request should be retried against the fallback. A caller cancellation or a
 * target-side 4xx is NOT a fallback trigger.
 */
function shouldFallback(error, signal) {
  // 1. The SearXNG host itself could not be reached (Docker down):
  //    ECONNREFUSED / ETIMEDOUT / ENOTFOUND / ... — walk the whole cause chain.
  if (isConnectError(error)) return true;
  if (error instanceof WebError) {
    // 2. Internal timeout while the caller did NOT cancel: SearXNG hung.
    if (error.code === "WEB_ABORTED" && signal?.aborted !== true) return true;
    // 3. SearXNG answered with a server error: service up but broken.
    if (error.code === "WEB_PROVIDER_ERROR" && /HTTP [5-9]\d\d/.test(error.message)) return true;
  }
  return false;
}

/** Register the fallback provider with `ctx.web`. */
function apply(ctx) {
  ctx.web.registerSearchProvider(new FallbackSearchProvider(ctx));
}

export {
  Config,
  FALLBACK_PROVIDER_ID,
  FallbackSearchProvider,
  apply,
  inject,
  isConnectError,
  name,
  shouldFallback
};

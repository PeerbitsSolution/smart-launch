/**
 * TokenStorage interface + an in-memory reference implementation.
 *
 * This is intentionally the only implementation shipped (handover
 * §3.2/§6.1): "a pluggable token storage interface (in-memory + example
 * adapters only — no production data store shipped)". Consuming
 * applications must supply their own production-grade backend
 * (database, secret manager, encrypted session store, etc.) by
 * implementing `TokenStorage`.
 *
 * needs human security review: even though this implementation is
 * in-memory only, it is the shape every production storage adapter
 * will copy — review the interface contract, not just this file.
 */
import type { StoredToken, TokenStorage } from "./types.js";

/** Not for production. Tokens live only in process memory and are lost
 * on restart; there is no encryption, no multi-instance sharing, and no
 * eviction policy beyond explicit `delete`. Suitable for the example
 * app and for tests only. */
export class InMemoryTokenStorage implements TokenStorage {
  private readonly tokens = new Map<string, StoredToken>();

  async get(key: string): Promise<StoredToken | undefined> {
    return this.tokens.get(key);
  }

  async set(key: string, token: StoredToken): Promise<void> {
    this.tokens.set(key, token);
  }

  async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }
}

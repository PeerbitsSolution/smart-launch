import { describe, it, expect } from "vitest";
import { InMemoryTokenStorage } from "../src/storage";
import type { StoredToken } from "../src/types";

const sampleToken: StoredToken = {
  accessToken: "YOUR_ACCESS_TOKEN_HERE",
  tokenType: "Bearer",
  context: {},
};

describe("InMemoryTokenStorage", () => {
  it("returns undefined for a key that was never set", async () => {
    const storage = new InMemoryTokenStorage();
    expect(await storage.get("unknown")).toBeUndefined();
  });

  it("stores and retrieves a token by key", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", sampleToken);
    expect(await storage.get("session-1")).toEqual(sampleToken);
  });

  it("overwrites a previously stored token for the same key", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", sampleToken);
    await storage.set("session-1", { ...sampleToken, accessToken: "replacement" });
    expect((await storage.get("session-1"))?.accessToken).toBe("replacement");
  });

  it("deletes a stored token", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", sampleToken);
    await storage.delete("session-1");
    expect(await storage.get("session-1")).toBeUndefined();
  });

  it("keeps tokens for different keys isolated from one another", async () => {
    const storage = new InMemoryTokenStorage();
    await storage.set("session-1", sampleToken);
    await storage.set("session-2", { ...sampleToken, accessToken: "other-session" });
    expect((await storage.get("session-1"))?.accessToken).toBe("YOUR_ACCESS_TOKEN_HERE");
    expect((await storage.get("session-2"))?.accessToken).toBe("other-session");
  });
});

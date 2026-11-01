import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  authApi,
  configureSessionAuth,
  getBrowserSession,
  setWorkspaceSelection,
} from "./api";

const directory = { members: [], administrators: [] };
const json = (value: unknown, status = 200) => Response.json(value, { status });

beforeEach(() => {
  vi.useFakeTimers();
  configureSessionAuth(false);
  setWorkspaceSelection("club", "team");
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API read caching", () => {
  it("clears private reads when the session switches accounts", async () => {
    let email = "first@example.com";
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/session"))
          return json({ authenticated: true, email, csrfToken: "csrf" });
        reads++;
        return json(directory);
      }),
    );
    await getBrowserSession();
    await api.teamMembers("club", "team");
    await getBrowserSession();
    await api.teamMembers("club", "team");
    expect(reads).toBe(1);
    email = "second@example.com";
    await getBrowserSession();
    await api.teamMembers("club", "team");
    expect(reads).toBe(2);
  });
  it("reuses team reads and isolates organisations and teams", async () => {
    const fetch = vi.fn(async (_url: string, _options?: RequestInit) =>
      json(directory),
    );
    vi.stubGlobal("fetch", fetch);
    await Promise.all([
      api.teamMembers("a", "one"),
      api.teamMembers("a", "one"),
    ]);
    await api.teamMembers("a", "one");
    expect(fetch).toHaveBeenCalledTimes(1);
    await api.teamMembers("a", "two");
    await api.teamMembers("b", "one");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetch.mock.calls[2][1]?.headers).get("X-Organisation-Id"),
    ).toBe("b");
  });

  it("expires members after three minutes and the catalog after ten", async () => {
    const fetch = vi.fn(async () =>
      json({ ...directory, categories: [], ageGroups: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    await api.teamMembers("club", "team");
    await api.catalog();
    vi.advanceTimersByTime(3 * 60_000);
    await api.teamMembers("club", "team");
    await api.catalog();
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(7 * 60_000);
    await api.catalog();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("clears member reads after mutations, logout, and auth configuration changes", async () => {
    const fetch = vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "GET"
        ? json(directory)
        : new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetch);
    await api.teamMembers("club", "team");
    await api.removeTeamMember("team", "user");
    await api.teamMembers("club", "team");
    expect(fetch).toHaveBeenCalledTimes(3);
    await authApi.logout();
    await api.teamMembers("club", "team");
    expect(fetch).toHaveBeenCalledTimes(5);
    configureSessionAuth(false);
    await api.teamMembers("club", "team");
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does not cache failures or leak cached values after access rejection", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "Unavailable" }, 503))
      .mockResolvedValueOnce(json(directory))
      .mockResolvedValueOnce(json({ title: "Forbidden" }, 403))
      .mockResolvedValueOnce(json(directory));
    vi.stubGlobal("fetch", fetch);
    await expect(api.teamMembers("club", "team")).rejects.toThrow(
      "Unavailable",
    );
    await api.teamMembers("club", "team");
    await expect(api.drills()).rejects.toThrow("Forbidden");
    await api.teamMembers("club", "team");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not restore an invalidated cache when an older request finishes", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(directory));
    vi.stubGlobal("fetch", fetch);
    const oldRead = api.teamMembers("club", "team");
    await api.removeTeamMember("team", "user");
    finish(json(directory));
    await oldRead;
    await api.teamMembers("club", "team");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("isolates admin member reads by workspace and returns independent values", async () => {
    const fetch = vi.fn(async () =>
      json([{ userId: "member", firstName: "Original" }]),
    );
    vi.stubGlobal("fetch", fetch);
    const members = await api.members();
    members[0].firstName = "Changed";
    expect((await api.members())[0].firstName).toBe("Original");
    setWorkspaceSelection("other-club", "other-team");
    await api.members();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

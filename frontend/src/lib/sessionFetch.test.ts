import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sessionFetch } from "./sessionFetch";
import { getBrowserSession } from "./api";

const pending = () =>
  Response.json(
    { title: "Session refresh in progress", detail: "Please retry shortly." },
    { status: 503, headers: { "Retry-After": "1" } },
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("recovers session bootstrap after an interrupted deployment reservation expires", async () => {
  const session = {
    authenticated: true,
    email: "coach@example.com",
    csrfToken: "csrf",
  };
  const fetch = vi
    .fn()
    .mockImplementationOnce(pending)
    .mockImplementationOnce(pending)
    .mockResolvedValueOnce(Response.json(session));
  vi.stubGlobal("fetch", fetch);
  const result = getBrowserSession();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toEqual(session);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("preserves write bodies and CSRF headers when authentication rejects before the controller", async () => {
  const fetch = vi
    .fn()
    .mockImplementationOnce(pending)
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const options = {
    method: "POST",
    headers: { "X-CSRF-TOKEN": "csrf" },
    body: '{"name":"Practice"}',
  };
  const result = sessionFetch("/api/trainings", options);
  await vi.runAllTimersAsync();
  expect((await result).status).toBe(204);
  expect(fetch.mock.calls[1]).toEqual(["/api/trainings", options]);
});

it.each([500, 503, 429, 401])(
  "does not retry general failures with status %s",
  async (status) => {
    const response = Response.json({ title: "Unavailable" }, { status });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    expect(await sessionFetch("/api/drills", {})).toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("requires the retry header as well as the specific problem title", async () => {
  const response = Response.json(
    { title: "Session refresh in progress" },
    { status: 503 },
  );
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  expect(await sessionFetch("/api/drills", {})).toBe(response);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("stops after a bounded number of reservation retries", async () => {
  const fetch = vi.fn(pending);
  vi.stubGlobal("fetch", fetch);
  const result = sessionFetch("/api/auth/session", {});
  await vi.runAllTimersAsync();
  expect((await result).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(7);
});

it("cancels retry waits when a read becomes obsolete", async () => {
  const fetch = vi.fn(pending);
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = sessionFetch("/api/drills", { signal: controller.signal });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100);
  controller.abort();
  await rejected;
  await vi.runAllTimersAsync();
  expect(fetch).toHaveBeenCalledTimes(1);
});

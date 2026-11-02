const retryDelays = [1000, 2000, 4000, 8000, 8000, 8000];

function wait(
  milliseconds: number,
  signal?: AbortSignal | null,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** Retry only the refresh reservation response, issued before a controller executes. */
export async function sessionFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 503 || attempt >= retryDelays.length)
      return response;
    const problem = await response
      .clone()
      .json()
      .catch(() => null);
    if (
      problem?.title !== "Session refresh in progress" ||
      response.headers.get("Retry-After") !== "1"
    )
      return response;
    await wait(retryDelays[attempt], options.signal);
  }
}

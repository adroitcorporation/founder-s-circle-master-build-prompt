export async function api<T = { ok: boolean }>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(!(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to connect. Please check your connection and try again.",
    );
  }
  if (response.status === 204) return undefined as T;

  // A stopped backend or proxy can return an empty body or an HTML error page.
  // Never expose JSON parser errors (or raw server HTML) to the user.
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an unexpected response. Please try again."
        : "The service is temporarily unavailable. Please try again shortly.",
    );
  }
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? result.error
        : undefined;
    throw new Error(
      typeof message === "string" && message.trim()
        ? message
        : "Something went wrong. Please try again.",
    );
  }
  return result as T;
}
export const post = <T = { ok: boolean }>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export const patch = (path: string, data: unknown) =>
  api(path, { method: "PATCH", body: JSON.stringify(data) });

export async function api<T = { ok: boolean }>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(!(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}
export const post = <T = { ok: boolean }>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export const patch = (path: string, data: unknown) =>
  api(path, { method: "PATCH", body: JSON.stringify(data) });

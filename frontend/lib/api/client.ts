/** Public backend origin only; authentication remains authoritative on the backend. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = apiUrl("");
  if (!path.startsWith("/api/")) throw new Error("Expected an API path.");
  return fetch(base + path, { ...init, credentials: "include" });
}
export function apiUrl(path: string): string {
  return (
    (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
      /\/$/,
      "",
    ) + path
  );
}

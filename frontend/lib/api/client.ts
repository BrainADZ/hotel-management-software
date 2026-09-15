/** Public backend origin only; authentication remains authoritative on the backend. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = apiUrl("");
  if (!path.startsWith("/api/")) throw new Error("Expected an API path.");
  return fetch(base + path, { ...init, credentials: "include" }).then(response=>{
    if(response.status===401 && !path.startsWith('/api/auth/login') && typeof window!=='undefined') window.dispatchEvent(new Event('hotel-auth-expired'));
    return response;
  });
}
export function apiUrl(path: string): string {
  return (
    (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
      /\/$/,
      "",
    ) + path
  );
}

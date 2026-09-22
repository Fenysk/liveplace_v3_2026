// Une redirection qui pose des cookies : la réponse des routes `/auth/*` (§10.1).
export function redirectWithCookies(location: string, cookies: readonly string[]): Response {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

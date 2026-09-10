import { resolveHostingIdentity } from '@/services/auth/session';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';

export async function getChatGPTUser(headers: Headers): Promise<ChatGPTUser | null> {
  const identity = await resolveHostingIdentity(headers);
  if (!identity) return null;
  return { userId: identity.subject, displayName: identity.fullName ?? identity.email,
    email: identity.email, fullName: identity.fullName };
}

export async function requireChatGPTUser(
  headers: Headers,
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser(headers);
  if (user) return user;

  throw new Error(`Authentication required: ${chatGPTSignInPath(returnTo)}`);
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

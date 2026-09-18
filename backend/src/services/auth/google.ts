import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify as verifySignature,
  type JsonWebKey,
} from "node:crypto";

import { and, eq } from "drizzle-orm";
import { DomainError } from "@hotel/shared/domain";

import { appUsers, userAuthIdentities } from "@/db/schema";
import { getDb } from "@/db";
import { createSessionForUser } from "./local-session";

const FLOW_COOKIE = "hotel_google_flow";

const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

const frontendOrigin = () =>
  (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000")
    .split(",")[0]!
    .trim();

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

const secureSuffix = () =>
  process.env.LOCAL_AUTH_COOKIE_SECURE === "false"
    ? ""
    : "; Secure";

const encode = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

function readCookie(headers: Headers, name: string) {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function beginGoogleLogin() {
  if (!googleConfigured()) {
    throw new DomainError(
      "GOOGLE_NOT_CONFIGURED",
      "Google sign-in is not configured.",
      503,
    );
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");

  const flow = encode(
    JSON.stringify({
      state,
      nonce,
      verifier,
      expires: Date.now() + 10 * 60_000,
    }),
  );

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256")
      .update(verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return {
    location:
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,

    cookie:
      `${FLOW_COOKIE}=${encodeURIComponent(flow)}; ` +
      `Path=/api/auth/google; ` +
      `HttpOnly; SameSite=Lax; Max-Age=600${secureSuffix()}`,
  };
}

type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function verifyIdToken(
  token: string,
  expectedNonce: string,
): Promise<GoogleClaims> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response is invalid.",
      401,
    );
  }

  let header: {
    alg?: string;
    kid?: string;
  };

  let claims: GoogleClaims;

  try {
    header = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString(),
    ) as {
      alg?: string;
      kid?: string;
    };

    claims = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString(),
    ) as GoogleClaims;
  } catch {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response is invalid.",
      401,
    );
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response is invalid.",
      401,
    );
  }

  const keysResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/certs",
  );

  if (!keysResponse.ok) {
    throw new DomainError(
      "GOOGLE_UNAVAILABLE",
      "Google identity verification is temporarily unavailable.",
      502,
    );
  }

  const { keys } = (await keysResponse.json()) as {
    keys: Array<JsonWebKey & { kid?: string }>;
  };

  const jwk = keys.find(
    (candidate) => candidate.kid === header.kid,
  );

  if (!jwk) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response is invalid.",
      401,
    );
  }

  const signatureValid = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({
      key: jwk,
      format: "jwk",
    }),
    Buffer.from(parts[2]!, "base64url"),
  );

  if (!signatureValid) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response is invalid.",
      401,
    );
  }

  const audience = Array.isArray(claims.aud)
    ? claims.aud
    : [claims.aud];

  if (
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    !audience.includes(process.env.GOOGLE_CLIENT_ID) ||
    !claims.exp ||
    claims.exp * 1000 <= Date.now() ||
    claims.nonce !== expectedNonce ||
    !claims.sub ||
    !claims.email ||
    claims.email_verified !== true
  ) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity response failed validation.",
      401,
    );
  }

  return claims;
}

export async function completeGoogleLogin(request: Request) {
  if (!googleConfigured()) {
    throw new DomainError(
      "GOOGLE_NOT_CONFIGURED",
      "Google sign-in is not configured.",
      503,
    );
  }

  const url = new URL(request.url);

  const flowValue = readCookie(
    request.headers,
    FLOW_COOKIE,
  );

  if (!flowValue) {
    throw new DomainError(
      "OAUTH_STATE_INVALID",
      "Google sign-in session expired. Please try again.",
      400,
    );
  }

  let flow: {
    state: string;
    nonce: string;
    verifier: string;
    expires: number;
  };

  try {
    flow = JSON.parse(
      Buffer.from(flowValue, "base64url").toString(),
    ) as {
      state: string;
      nonce: string;
      verifier: string;
      expires: number;
    };
  } catch {
    throw new DomainError(
      "OAUTH_STATE_INVALID",
      "Google sign-in session is invalid.",
      400,
    );
  }

  const returnedState = url.searchParams.get("state");

  if (
    !returnedState ||
    returnedState !== flow.state ||
    flow.expires < Date.now()
  ) {
    throw new DomainError(
      "OAUTH_STATE_INVALID",
      "Google sign-in state validation failed.",
      400,
    );
  }

  const code = url.searchParams.get("code");

  if (!code) {
    throw new DomainError(
      "GOOGLE_AUTH_FAILED",
      "Google did not return an authorization code.",
      400,
    );
  }

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },

      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret:
          process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
    },
  );

  if (!tokenResponse.ok) {
    throw new DomainError(
      "GOOGLE_AUTH_FAILED",
      "Google authorization could not be completed.",
      401,
    );
  }

  const tokens = (await tokenResponse.json()) as {
    id_token?: string;
  };

  if (!tokens.id_token) {
    throw new DomainError(
      "GOOGLE_TOKEN_INVALID",
      "Google identity token is missing.",
      401,
    );
  }

  const claims = await verifyIdToken(
    tokens.id_token,
    flow.nonce,
  );

  const db = getDb();

  const email = claims.email!.trim().toLowerCase();
  const googleSubject = claims.sub!;
  const timestamp = new Date().toISOString();

  /*
   * SECURITY:
   *
   * Never automatically match a Google user to appUsers
   * using email alone.
   *
   * app_users email uniqueness is organisation-scoped,
   * therefore the same email may exist in multiple
   * organisations.
   *
   * Google access must be explicitly linked through
   * userAuthIdentities.provider + providerSubject.
   */
  const existingIdentity = (
    await db
      .select()
      .from(userAuthIdentities)
      .where(
        and(
          eq(
            userAuthIdentities.provider,
            "google",
          ),
          eq(
            userAuthIdentities.providerSubject,
            googleSubject,
          ),
        ),
      )
      .limit(1)
  )[0];

  const user = existingIdentity?.userId
    ? (
        await db
          .select()
          .from(appUsers)
          .where(
            eq(
              appUsers.id,
              existingIdentity.userId,
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  if (user && !user.active) {
    throw new DomainError(
      "USER_FORBIDDEN",
      "This application account is inactive.",
      403,
    );
  }

  /*
   * Google successfully verified the person,
   * but no hotel application user has explicitly
   * been linked to this Google identity.
   */
  if (!user) {
    await db
      .insert(userAuthIdentities)
      .values({
        id:
          existingIdentity?.id ??
          randomUUID(),

        userId: null,

        provider: "google",

        providerSubject: googleSubject,

        email,

        emailVerified: true,

        displayName:
          claims.name ?? null,

        avatarUrl:
          claims.picture ?? null,

        status: "PENDING",

        createdAt:
          existingIdentity?.createdAt ??
          timestamp,

        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: [
          userAuthIdentities.provider,
          userAuthIdentities.providerSubject,
        ],

        set: {
          userId: null,

          email,

          emailVerified: true,

          displayName:
            claims.name ?? null,

          avatarUrl:
            claims.picture ?? null,

          status: "PENDING",

          updatedAt: timestamp,
        },
      });

    throw new DomainError(
      "USER_UNPROVISIONED",
      "Your Google identity is verified but has not been granted hotel access.",
      403,
    );
  }

  await db
    .insert(userAuthIdentities)
    .values({
      id: existingIdentity!.id,

      userId: user.id,

      provider: "google",

      providerSubject: googleSubject,

      email,

      emailVerified: true,

      displayName:
        claims.name ?? null,

      avatarUrl:
        claims.picture ?? null,

      status: "ACTIVE",

      createdAt:
        existingIdentity!.createdAt,

      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        userAuthIdentities.provider,
        userAuthIdentities.providerSubject,
      ],

      set: {
        userId: user.id,

        email,

        emailVerified: true,

        displayName:
          claims.name ?? null,

        avatarUrl:
          claims.picture ?? null,

        status: "ACTIVE",

        updatedAt: timestamp,
      },
    });

  await db
    .update(appUsers)
    .set({
      displayName:
        user.displayName ??
        claims.name ??
        user.name,

      googleAvatarUrl:
        claims.picture ??
        user.googleAvatarUrl,

      updatedAt: timestamp,
    })
    .where(
      eq(
        appUsers.id,
        user.id,
      ),
    );

  const session =
    await createSessionForUser(user.id);

  return {
    ...session,

    redirect: frontendOrigin(),

    clearFlowCookie:
      `${FLOW_COOKIE}=; ` +
      `Path=/api/auth/google; ` +
      `HttpOnly; SameSite=Lax; Max-Age=0${secureSuffix()}`,
  };
}

export function googleErrorRedirect(
  error: unknown,
) {
  const message =
    error instanceof DomainError
      ? error.message
      : "Google sign-in could not be completed.";

  return (
    `${frontendOrigin()}/?authError=` +
    encodeURIComponent(message)
  );
}
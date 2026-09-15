"use client";

/* eslint-disable @next/next/no-img-element -- The supplied BrainADZ logo is served directly from public assets. */

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import {readProductionOffline,clearProductionOffline} from '@/lib/production-offline';
import { HotelPlatform } from "./hotel-platform";
import { apiFetch, apiUrl } from "@/lib/api/client";

type Mode = "demo" | "production";

type Runtime = {
  mode: Mode;
  authenticated: boolean;
  googleConfigured: boolean;
};

type FocusedField = "email" | "password" | null;

const DEMO_EMAIL = "web@brainadz.marketing";
const DEMO_PASSWORD = "admin@HMS";

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  const [loginOptions, setLoginOptions] = useState({
    googleConfigured: false,
  });

  async function loadRuntime(): Promise<Runtime> {
    if(!navigator.onLine){const cached=await readProductionOffline();if(cached)return {mode:'production',authenticated:true,googleConfigured:false};throw new Error('Connect to the hotel server and sign in before using this device offline.');}

    const response = await apiFetch("/api/runtime");

    if (!response.ok) {
      throw new Error("Application configuration could not be loaded.");
    }

    const body = (await response.json()) as {
      mode?: Mode;
      googleConfigured?: boolean;
    };

    if (body.mode !== "demo" && body.mode !== "production") {
      throw new Error("Invalid application configuration.");
    }

    const googleConfigured = Boolean(body.googleConfigured);

    if (body.mode === "demo") {
      return {
        mode: body.mode,
        authenticated: true,
        googleConfigured,
      };
    }

    const context = await apiFetch("/api/context", {
      cache: "no-store",
    });

    return {
      mode: body.mode,
      authenticated: context.ok,
      googleConfigured,
    };
  }

  function applyRuntime(runtime: Runtime) {
    setMode(runtime.mode);
    setAuthenticated(runtime.authenticated);

    setLoginOptions({
      googleConfigured: runtime.googleConfigured,
    });
  }

  useEffect(() => {
    void loadRuntime()
      .then(applyRuntime)
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Application could not start.",
        );
      });
  }, []);
  useEffect(() => {
    if (pathname === "/" && mode && (mode === "demo" || authenticated)) {
      router.replace("/hotel");
    }
  }, [authenticated, mode, pathname, router]);

  useEffect(()=>{const expired=()=>{setAuthenticated(false);void clearProductionOffline();};window.addEventListener('hotel-auth-expired',expired);return()=>window.removeEventListener('hotel-auth-expired',expired);},[]);

  async function logout() {
    await clearProductionOffline();
    setAuthenticated(false);
    if(!navigator.onLine)return;
    await apiFetch("/api/auth/logout", {
      method: "POST",
    });

    setAuthenticated(false);
  }

  if (error) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <h1>Hotel Management</h1>

          <p role="alert">{error}</p>

          <button
            className="primary-button"
            onClick={() => {
              setError("");

              void loadRuntime()
                .then(applyRuntime)
                .catch((cause) => {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Application could not start.",
                  );
                });
            }}
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  if (!mode) {
    return null;
  }

  if (mode === "production" && !authenticated) {
    return (
      <LocalLogin {...loginOptions} onSuccess={() => setAuthenticated(true)} />
    );
  }

  return (
    <HotelPlatform
      appMode={mode}
      onLogout={mode === "production" ? logout : undefined}
    />
  );
}

function LocalLogin({
  onSuccess,
  googleConfigured,
}: {
  onSuccess: () => void;
  googleConfigured: boolean;
}) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);

  const [error, setError] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("authError") ?? "";
  });

  const [busy, setBusy] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const body = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Login failed.");
      }

      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <img src="/main-logo.png" alt="BrainADZ" />

        <p className="eyebrow">Hotel Management Software</p>

        <h1>Welcome Back</h1>

        <p>Sign in to your account</p>

        <label>
          <span>Email</span>

          <input
            autoComplete="username"
            type="email"
            required
            value={email}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              opacity: focusedField === "email" ? 1 : 0.72,
              transition: "opacity 160ms ease",
            }}
          />
        </label>

        <label>
          <span>Password</span>

          <input
            autoComplete="current-password"
            type="password"
            required
            value={password}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              opacity: focusedField === "password" ? 1 : 0.72,
              transition: "opacity 160ms ease",
            }}
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <div className="login-divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          className="google-button"
          disabled={!googleConfigured}
          onClick={() => {
            window.location.href = apiUrl("/api/auth/google");
          }}
        >
          <strong>G</strong>
          <span>Continue with Google</span>
        </button>

        {!googleConfigured && (
          <small className="google-unavailable">
            Google sign-in not configured
          </small>
        )}
      </form>
    </main>
  );
}

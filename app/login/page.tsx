"use client";

import { useActionState, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "signin" ? signIn : signUp,
    {},
  );

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <ThemeToggle className="absolute end-4 top-4" />
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Library Assistant</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Answers come only from the curated document library.
        </p>

        <form action={action} className="mt-6 space-y-3">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            className="input"
          />
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            className="input"
          />
          {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-sm text-[var(--muted)] underline-offset-2 hover:underline"
        >
          {mode === "signin" ? "Invited? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

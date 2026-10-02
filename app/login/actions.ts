"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };
  redirect("/");
}

/**
 * Invite-only sign-up: the email must be on ADMIN_EMAILS or ALLOWED_EMAILS. The account
 * is created pre-confirmed, so no confirmation email (and no SMTP setup) is needed.
 */
export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!isAllowedEmail(email)) {
    return { error: "This email isn't on the invite list. Ask the administrator for access." };
  }
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    return {
      error: /already/i.test(createError.message)
        ? "An account with this email already exists. Sign in instead."
        : createError.message,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

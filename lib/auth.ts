import { createClient } from "@/lib/supabase/server";

function emailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && emailList(process.env.ADMIN_EMAILS).includes(email.toLowerCase());
}

/** Admins can always sign up; others must be listed in ALLOWED_EMAILS, or it must be "*" (open sign-up). */
export function isAllowedEmail(email: string): boolean {
  const e = email.toLowerCase();
  const allowed = emailList(process.env.ALLOWED_EMAILS);
  return isAdminEmail(e) || allowed.includes("*") || allowed.includes(e);
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Returns the admin user, or null when the caller is not an admin. */
export async function getAdmin() {
  const user = await getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

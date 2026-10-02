import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { getUser, isAdminEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ChatLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title")
    .order("updated_at", { ascending: false })
    .limit(50);

  const nav = (
    <>
      <Link href="/" className="btn-primary block text-center">
        + New chat
      </Link>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
        {(conversations ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.id}`}
            className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-[var(--border)]"
            title={c.title}
          >
            {c.title}
          </Link>
        ))}
      </nav>
      <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-sm">
        {isAdminEmail(user.email) && (
          <Link href="/admin" className="btn-ghost block">
            Manage library
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className="btn-ghost w-full text-start">
            Sign out <span className="text-xs">({user.email})</span>
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-e border-[var(--border)] bg-[var(--panel)] p-3 md:flex">
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <details className="border-b border-[var(--border)] bg-[var(--panel)] md:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">☰ Library Assistant</summary>
          <div className="flex max-h-[70dvh] flex-col px-4 pb-4">{nav}</div>
        </details>
        {children}
      </div>
    </div>
  );
}

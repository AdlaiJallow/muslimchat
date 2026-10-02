import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPanel, type DocumentRow } from "@/components/AdminPanel";
import { getAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  if (!(await getAdmin())) redirect("/");

  const { data: documents } = await createAdminClient()
    .from("documents")
    .select("id, title, filename, collection, status, page_count, chunk_count, error, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge base</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            The assistant answers only from documents listed here as <em>ready</em>.
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          ← Back to chat
        </Link>
      </div>
      <AdminPanel initialDocuments={(documents ?? []) as DocumentRow[]} />
    </main>
  );
}

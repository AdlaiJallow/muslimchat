import { notFound } from "next/navigation";
import { Chat, type ChatMessage } from "@/components/Chat";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationPage(props: PageProps<"/c/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: convo } = await supabase.from("conversations").select("id").eq("id", id).maybeSingle();
  if (!convo) notFound();

  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content, citations")
    .eq("conversation_id", id)
    .order("id");

  return <Chat key={id} conversationId={id} initialMessages={(rows ?? []) as ChatMessage[]} />;
}

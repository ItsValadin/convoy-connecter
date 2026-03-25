import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 30_000).toISOString(); // 30s

  // 1. Delete stale members (not seen in 30s)
  const { data: deletedMembers, error: memberError } = await supabase
    .from("convoy_members")
    .delete()
    .lt("last_seen", staleThreshold)
    .select("convoy_id");

  if (memberError) {
    console.error("Error deleting stale members:", memberError);
  }

  // 2. Find convoys with zero members and delete them
  const { data: convoys, error: convoyFetchError } = await supabase
    .from("convoys")
    .select("id");

  if (convoyFetchError) {
    console.error("Error fetching convoys:", convoyFetchError);
    return new Response(JSON.stringify({ error: convoyFetchError.message }), { status: 500 });
  }

  let deletedConvoys = 0;
  if (convoys && convoys.length > 0) {
    // For each convoy, check if it has any members
    const { data: activeMemberRows } = await supabase
      .from("convoy_members")
      .select("convoy_id");

    const activeConvoyIds = new Set((activeMemberRows || []).map((m) => m.convoy_id));
    const emptyConvoyIds = convoys
      .filter((c) => !activeConvoyIds.has(c.id))
      .map((c) => c.id);

    if (emptyConvoyIds.length > 0) {
      // Delete messages first (foreign key), then convoys
      await supabase
        .from("convoy_messages")
        .delete()
        .in("convoy_id", emptyConvoyIds);

      const { error: deleteError } = await supabase
        .from("convoys")
        .delete()
        .in("id", emptyConvoyIds);

      if (deleteError) {
        console.error("Error deleting empty convoys:", deleteError);
      } else {
        deletedConvoys = emptyConvoyIds.length;
      }
    }
  }

  const result = {
    stale_members_deleted: deletedMembers?.length ?? 0,
    empty_convoys_deleted: deletedConvoys,
    timestamp: now.toISOString(),
  };

  console.log("Cleanup result:", result);
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});

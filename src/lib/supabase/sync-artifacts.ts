import { createClient } from "./server";

export async function syncArtifactToCodeLibrary(artifact: {
  name: string;
  description: string;
  tags: string[];
  language: string;
  files: Array<{ path: string; content: string; language: string }>;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("code_library")
      .insert({
        name: artifact.name,
        description: artifact.description,
        tags: artifact.tags,
        language: artifact.language,
        files_json: artifact.files,
        created_by: "system",
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function queryCodeLibrary(filters?: {
  q?: string;
  language?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: any[]; total: number; error?: string }> {
  try {
    const supabase = await createClient();
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    let query = supabase.from("code_library").select("*", { count: "exact" });

    if (filters?.language) query = query.eq("language", filters.language);
    if (filters?.q) {
      query = query.or("name.ilike.%" + filters.q + "%,description.ilike.%" + filters.q + "%");
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { entries: [], total: 0, error: error.message };
    return { entries: data ?? [], total: count ?? 0 };
  } catch (err: unknown) {
    return { entries: [], total: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncMarketplaceListing(entry: {
  name: string;
  description: string;
  assetClass: string;
  sourceUrl?: string;
  tags: string[];
  priceCredits: number;
  department?: string;
  creatorId?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("marketplace_listings")
      .upsert(
        {
          name: entry.name,
          description: entry.description,
          asset_class: entry.assetClass,
          source_url: entry.sourceUrl ?? null,
          tags: entry.tags,
          price_credits: entry.priceCredits,
          department: entry.department ?? null,
          creator_id: entry.creatorId ?? "system",
          is_active: true,
        },
        { onConflict: "name", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
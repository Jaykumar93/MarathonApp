import { supabase } from "../supabase";

export interface ShoeRow {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  /** Trigger-maintained from activities.distance_meters (see maintain_shoe_mileage) - never write to this directly. */
  cumulative_distance_km: number;
  retirement_threshold_km: number;
  retired: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateShoeInput {
  name: string;
  brand?: string;
  /** Optional starting mileage for a shoe you've already been running in before adding it here - the trigger only adds future logged distance on top of whatever this is seeded to. */
  startingDistanceKm?: number;
}

/** Every shoe for a user, non-retired first, most recently added first within each group - matches how a picker should offer them (active shoes first). */
export async function getShoes(userId: string): Promise<ShoeRow[]> {
  const { data, error } = await supabase
    .from("shoes")
    .select("*")
    .eq("user_id", userId)
    .order("retired", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ShoeRow[];
}

export async function createShoe(userId: string, input: CreateShoeInput): Promise<ShoeRow> {
  const { data, error } = await supabase
    .from("shoes")
    .insert({
      user_id: userId,
      name: input.name,
      brand: input.brand ?? null,
      cumulative_distance_km: input.startingDistanceKm ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ShoeRow;
}

export interface UpdateShoeInput {
  name?: string;
  brand?: string | null;
  retirementThresholdKm?: number;
}

export async function updateShoe(shoeId: string, input: UpdateShoeInput): Promise<ShoeRow> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.brand !== undefined) updates.brand = input.brand;
  if (input.retirementThresholdKm !== undefined) updates.retirement_threshold_km = input.retirementThresholdKm;

  const { data, error } = await supabase.from("shoes").update(updates).eq("id", shoeId).select().single();
  if (error) throw error;
  return data as ShoeRow;
}

/** One-way, same as everywhere else in this app soft-deletes/retires rather than destroys - a retired shoe's mileage history stays intact and it just stops being offered in the picker. */
export async function retireShoe(shoeId: string, retired = true): Promise<void> {
  const { error } = await supabase.from("shoes").update({ retired }).eq("id", shoeId);
  if (error) throw error;
}

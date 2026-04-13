import { supabase } from './supabase'

const LOCK_TTL_MINUTES = 30

/**
 * Try to acquire a lock on a concept for editing.
 * Returns { ok: true } or { ok: false, holder: 'Name' }
 */
export async function acquireLock(
  conceptId: string,
  userId: string
): Promise<{ ok: boolean; holder?: string }> {
  // Clean expired locks first
  const cutoff = new Date(Date.now() - LOCK_TTL_MINUTES * 60 * 1000).toISOString()
  await supabase.from('concept_locks').delete().lt('locked_at', cutoff)

  // Check existing lock
  const { data: existing } = await supabase
    .from('concept_locks')
    .select('locked_by, locked_at')
    .eq('concept_id', conceptId)
    .single()

  if (existing) {
    if (existing.locked_by === userId) {
      // Refresh own lock
      await supabase
        .from('concept_locks')
        .update({ locked_at: new Date().toISOString() })
        .eq('concept_id', conceptId)
      return { ok: true }
    }
    // Someone else has it
    const { data: other } = await supabase
      .from('admin_users')
      .select('name')
      .eq('id', existing.locked_by)
      .single()
    return { ok: false, holder: other?.name || 'Another user' }
  }

  // Try to acquire
  const { error } = await supabase.from('concept_locks').insert({
    concept_id: conceptId,
    locked_by: userId,
  })

  if (error) {
    // Race condition
    return { ok: false, holder: 'Another user' }
  }
  return { ok: true }
}

/**
 * Release lock when done editing or navigating away.
 */
export async function releaseLock(conceptId: string, userId: string) {
  await supabase
    .from('concept_locks')
    .delete()
    .eq('concept_id', conceptId)
    .eq('locked_by', userId)
}

/**
 * Release all locks held by a user (call on logout or page unload).
 */
export async function releaseAllLocks(userId: string) {
  await supabase.from('concept_locks').delete().eq('locked_by', userId)
}

/**
 * Increment a daily activity counter for the current user.
 */
export async function incrementActivity(
  userId: string,
  field: 'concepts_entered' | 'concepts_generated' | 'concepts_submitted' | 'concepts_approved' | 'concepts_rejected'
) {
  const today = new Date().toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('daily_activity')
    .select('id, ' + field)
    .eq('user_id', userId)
    .eq('activity_date', today)
    .single()

  if (existing && typeof existing === 'object' && 'id' in existing) {
    const row = existing as unknown as {
      id: string
    } & Partial<
      Record<
        | 'concepts_entered'
        | 'concepts_generated'
        | 'concepts_submitted'
        | 'concepts_approved'
        | 'concepts_rejected',
        number
      >
    >
    const current = row[field] ?? 0
    await supabase.from('daily_activity').update({ [field]: current + 1 }).eq('id', row.id)
  } else {
    await supabase.from('daily_activity').insert({
      user_id: userId,
      activity_date: today,
      [field]: 1,
    })
  }
}

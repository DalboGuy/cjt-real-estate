/**
 * Owner calendar entry writes that do not change dates or kind.
 * Notes-only update — no conflict re-check.
 */

function normalizeEntryNotes(notes) {
  return String(notes || '').trim().slice(0, 500) || null;
}

async function updateOwnerEntryNotes(sql, { id, notes }) {
  const normalized = normalizeEntryNotes(notes);
  const rows = await sql`
    UPDATE owner_calendar_entries
    SET notes=${normalized}, updated_at=now()
    WHERE id=${id}
    RETURNING id, kind, start_date::text, end_date::text, notes
  `;
  if (!rows.length) {
    return {
      ok: false,
      status: 404,
      error: 'not_found',
      message: 'That block or stay was not found.'
    };
  }
  return { ok: true, entry: rows[0] };
}

module.exports = {
  normalizeEntryNotes,
  updateOwnerEntryNotes
};

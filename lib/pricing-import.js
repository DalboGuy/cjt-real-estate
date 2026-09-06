function validateRows(input) {
  if (!Array.isArray(input) || !input.length || input.length > 730) throw new Error('Use 1–730 pricing rows.');
  const seen = new Set();
  return input.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error('Invalid row ' + (i + 1));
    const date = String(r.date || '');
    const d = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== date) throw new Error('Invalid date on row ' + (i + 1));
    if (seen.has(date)) throw new Error('Duplicate date: ' + date);
    seen.add(date);
    const rate = Number(r.nightly_rate);
    if (r.nightly_rate === '' || r.nightly_rate == null || !Number.isFinite(rate) || rate <= 0 || rate > 5000 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) throw new Error('Nightly rate must be $0.01–$5,000 with at most two decimals: ' + date);
    const min = r.min_nights === '' || r.min_nights == null ? null : Number(r.min_nights);
    if (min !== null && (!Number.isInteger(min) || min < 1 || min > 30)) throw new Error('Minimum nights must be 1–30: ' + date);
    const label = String(r.label || '').trim();
    if (label.length > 100) throw new Error('Label exceeds 100 characters: ' + date);
    return {date, nightly_rate:rate, min_nights:min, label:label || null};
  }).sort((a,b) => a.date.localeCompare(b.date));
}

async function saveRows(sql, input, userId) {
  const rows = validateRows(input);
  // One SQL statement: a failed row cannot leave a partially imported file.
  const saved = await sql`
    INSERT INTO pricing_overrides(stay_date,nightly_rate,min_nights,label,updated_by_user_id,updated_at)
    SELECT x.date::date,x.nightly_rate,x.min_nights,x.label,${userId},now()
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x(date text,nightly_rate numeric,min_nights integer,label text)
    ON CONFLICT (stay_date) DO UPDATE SET nightly_rate=EXCLUDED.nightly_rate,
      min_nights=EXCLUDED.min_nights,label=EXCLUDED.label,
      updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
    RETURNING stay_date::text,nightly_rate::float8,min_nights,label
  `;
  return {ok:true,count:saved.length,rows:saved};
}
module.exports={validateRows,saveRows};

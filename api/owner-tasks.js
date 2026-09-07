const { db, ensureSchema } = require('../lib/db');
const { previewPasswordFreeActive } = require('../lib/preview-access');
const { loadOwnerTasks, createOwnerTask } = require('../lib/owner-tasks');

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((v) => v.trim()).filter(Boolean).map((v) => {
    const i = v.indexOf('=');
    return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
}

async function authenticated(req) {
  if (previewPasswordFreeActive(req)) return true;
  await ensureSchema();
  const token = parseCookies(req.headers.cookie || '').cjt_owner_session;
  if (!token) return false;
  const crypto = require('crypto');
  const sql = db();
  const rows = await sql`SELECT token_hash FROM owner_sessions WHERE token_hash=${crypto.createHash('sha256').update(token).digest('hex')} AND expires_at>now() LIMIT 1`;
  return rows.length > 0;
}

function readBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return req.body || {};
}

module.exports = async function (req, res) {
  try {
    if (!(await authenticated(req))) return res.status(401).json({ error: 'unauthorized' });
    await ensureSchema();
    const sql = db();
    if (req.method === 'GET') {
      const query = {
        status: req.query?.status || '',
        due: req.query?.due || '',
        assignee: req.query?.assignee || '',
        q: req.query?.q || ''
      };
      const data = await loadOwnerTasks(sql, query);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        checkedAt: new Date().toISOString(),
        available: data.available,
        summary: data.summary,
        tasks: data.tasks,
        error: data.error || null
      });
    }
    if (req.method === 'POST') {
      const body = readBody(req);
      if (body.action !== 'create') return res.status(400).json({ error: 'invalid_action' });
      try {
        const task = await createOwnerTask(sql, body);
        return res.status(200).json({ ok: true, task });
      } catch (error) {
        const code = error.code || error.message || 'tasks_write_failed';
        const status = code === 'tasks_unavailable' || code === 'tasks_write_unsupported' ? 409 : 400;
        return res.status(status).json({ error: code, message: 'This destination could not save a task until the operations table is confirmed.' });
      }
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error('owner-tasks api error', error);
    return res.status(500).json({ error: 'owner_tasks_api_error' });
  }
};

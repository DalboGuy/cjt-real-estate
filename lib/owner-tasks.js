'use strict';

const CLOSED = new Set(['completed', 'done', 'closed', 'cancelled', 'canceled']);
const TITLE_CANDIDATES = ['title', 'name', 'task', 'summary', 'description'];
const STATUS_CANDIDATES = ['status', 'state'];
const PRIORITY_CANDIDATES = ['priority', 'urgency'];
const DUE_CANDIDATES = ['due_date', 'due', 'due_at', 'deadline'];
const ASSIGNEE_CANDIDATES = ['assignee', 'assigned_to', 'owner', 'assigned'];
const ID_CANDIDATES = ['id', 'task_id'];

function pickColumn(columns, candidates) {
  const map = new Map((columns || []).map((col) => [String(col).toLowerCase(), col]));
  for (const name of candidates) {
    if (map.has(name)) return map.get(name);
  }
  return '';
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return 'open';
  if (CLOSED.has(status)) return status === 'canceled' ? 'cancelled' : status;
  return status;
}

function isOpenStatus(value) {
  return !CLOSED.has(normalizeStatus(value));
}

function isOverdue(due, status, now = new Date()) {
  if (!due || !isOpenStatus(status)) return false;
  const day = String(due).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  return day < today;
}

function mapTask(row, columns) {
  const titleCol = pickColumn(columns, TITLE_CANDIDATES);
  const statusCol = pickColumn(columns, STATUS_CANDIDATES);
  const priorityCol = pickColumn(columns, PRIORITY_CANDIDATES);
  const dueCol = pickColumn(columns, DUE_CANDIDATES);
  const assigneeCol = pickColumn(columns, ASSIGNEE_CANDIDATES);
  const idCol = pickColumn(columns, ID_CANDIDATES);
  const status = row[statusCol] || 'open';
  const due = dueCol ? row[dueCol] : null;
  return {
    id: idCol ? row[idCol] : null,
    title: titleCol ? (row[titleCol] || 'Task') : 'Task',
    status: normalizeStatus(status),
    priority: priorityCol ? String(row[priorityCol] || '').toLowerCase() : '',
    due: due ? String(due).slice(0, 10) : '',
    assignee: assigneeCol ? String(row[assigneeCol] || '').trim() : '',
    open: isOpenStatus(status),
    overdue: isOverdue(due, status)
  };
}

function summarizeTasks(rows = []) {
  const open = rows.filter((row) => row.open);
  const overdue = open.filter((row) => row.overdue);
  const high = open.filter((row) => ['high', 'urgent'].includes(row.priority));
  return {
    available: true,
    open: open.length,
    overdue: overdue.length,
    high_priority: high.length,
    total: rows.length
  };
}

function filterTasks(rows = [], query = {}) {
  const status = String(query.status || '').toLowerCase();
  const due = String(query.due || '').toLowerCase();
  const assignee = String(query.assignee || '').trim().toLowerCase();
  const q = String(query.q || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (status === 'open' && !row.open) return false;
    if (status && status !== 'open' && status !== 'all' && row.status !== status) return false;
    if (due === 'overdue' && !row.overdue) return false;
    if (due === 'today') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      if (row.due !== today) return false;
    }
    if (assignee && String(row.assignee || '').toLowerCase() !== assignee) return false;
    if (q && ![row.title, row.assignee, row.status, row.priority, row.due].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}

async function listTaskColumns(sql) {
  const present = await sql`SELECT to_regclass('public.tasks') AS name`;
  if (!present[0]?.name) return { available: false, columns: [] };
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tasks'
    ORDER BY ordinal_position
  `;
  return { available: true, columns: cols.map((row) => row.column_name) };
}

async function loadOwnerTasks(sql, query = {}) {
  try {
    const meta = await listTaskColumns(sql);
    if (!meta.available) {
      return { available: false, tasks: [], summary: { available: false, open: null, overdue: null, high_priority: null, total: null } };
    }
    const rows = await sql`SELECT * FROM tasks ORDER BY 1 DESC LIMIT 200`;
    const mapped = rows.map((row) => mapTask(row, meta.columns));
    const filtered = filterTasks(mapped, query);
    return {
      available: true,
      columns: meta.columns,
      tasks: filtered,
      all: mapped,
      summary: summarizeTasks(mapped)
    };
  } catch (error) {
    return {
      available: false,
      error: 'tasks_unavailable',
      tasks: [],
      summary: { available: false, open: null, overdue: null, high_priority: null, total: null }
    };
  }
}

async function createOwnerTask(sql, payload = {}) {
  const meta = await listTaskColumns(sql);
  if (!meta.available) {
    const error = new Error('tasks_unavailable');
    error.code = 'tasks_unavailable';
    throw error;
  }
  const titleCol = pickColumn(meta.columns, TITLE_CANDIDATES);
  const statusCol = pickColumn(meta.columns, STATUS_CANDIDATES);
  const dueCol = pickColumn(meta.columns, DUE_CANDIDATES);
  const assigneeCol = pickColumn(meta.columns, ASSIGNEE_CANDIDATES);
  if (!titleCol) {
    const error = new Error('tasks_write_unsupported');
    error.code = 'tasks_write_unsupported';
    throw error;
  }
  const title = String(payload.title || '').trim().slice(0, 200);
  if (!title) {
    const error = new Error('missing_title');
    error.code = 'missing_title';
    throw error;
  }
  const status = String(payload.status || 'open').trim() || 'open';
  const due = String(payload.due || '').slice(0, 10) || null;
  const assignee = String(payload.assignee || '').trim().slice(0, 80) || null;
  const assignments = [{ column: titleCol, value: title }];
  if (statusCol) assignments.push({ column: statusCol, value: status });
  if (dueCol && due) assignments.push({ column: dueCol, value: due });
  if (assigneeCol && assignee) assignments.push({ column: assigneeCol, value: assignee });
  function quoteIdent(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ''))) {
      const error = new Error('invalid_column');
      error.code = 'invalid_column';
      throw error;
    }
    return `"${name}"`;
  }
  const names = assignments.map((item) => quoteIdent(item.column));
  const values = assignments.map((item) => item.value);
  const inserted = await sql(
    `INSERT INTO tasks (${names.join(',')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    values
  );
  return mapTask(inserted[0] || { [titleCol]: title, [statusCol]: status }, meta.columns);
}

module.exports = {
  CLOSED,
  pickColumn,
  normalizeStatus,
  isOpenStatus,
  isOverdue,
  mapTask,
  summarizeTasks,
  filterTasks,
  listTaskColumns,
  loadOwnerTasks,
  createOwnerTask
};

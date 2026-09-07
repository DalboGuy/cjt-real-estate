'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapTask, summarizeTasks, filterTasks, isOverdue } = require('./owner-tasks');

test('mapTask normalizes unknown task tables without inventing zeros as verified', () => {
  const columns = ['id', 'title', 'status', 'priority', 'due_date', 'assignee'];
  const row = { id: 7, title: 'Restock linens', status: 'Open', priority: 'High', due_date: '2020-01-01', assignee: 'Joel' };
  const task = mapTask(row, columns);
  assert.equal(task.id, 7);
  assert.equal(task.open, true);
  assert.equal(task.priority, 'high');
  assert.equal(task.overdue, true);
});

test('summarize and filter overdue/open without treating missing tables as zero', () => {
  const rows = [
    mapTask({ id: 1, title: 'A', status: 'open', priority: 'high', due_date: '2020-01-01', assignee: 'Joel' }, ['id', 'title', 'status', 'priority', 'due_date', 'assignee']),
    mapTask({ id: 2, title: 'B', status: 'done', priority: 'low', due_date: '2099-01-01', assignee: 'Kim' }, ['id', 'title', 'status', 'priority', 'due_date', 'assignee'])
  ];
  const summary = summarizeTasks(rows);
  assert.equal(summary.available, true);
  assert.equal(summary.open, 1);
  assert.equal(summary.high_priority, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(filterTasks(rows, { due: 'overdue' }).length, 1);
  assert.equal(filterTasks(rows, { status: 'open', assignee: 'joel' }).length, 1);
  assert.equal(isOverdue('', 'open'), false);
});

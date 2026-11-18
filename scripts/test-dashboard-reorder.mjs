#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  reorderLinksInContainer,
  patchUpdatesForContainer,
} from '../src/lib/dashboard-reorder.js';

const links = [
  { id: 1, title: 'A', sort_order: 0, folder_id: null, visible: 1 },
  { id: 2, title: 'B', sort_order: 1, folder_id: null, visible: 1 },
  { id: 3, title: 'C', sort_order: 2, folder_id: null, visible: 1 },
  { id: 4, title: 'In folder', sort_order: 0, folder_id: 10, visible: 1 },
  { id: 10, title: 'Folder', sort_order: 3, folder_id: null, visible: 1, is_folder: 1 },
];

const next = reorderLinksInContainer(links, 3, 1, null);
assert.ok(next);
assert.equal(next.find((l) => l.id === 3).sort_order, 0);
assert.equal(next.find((l) => l.id === 1).sort_order, 1);
assert.equal(next.find((l) => l.id === 2).sort_order, 2);
assert.equal(next.find((l) => l.id === 4).folder_id, 10);

const inside = reorderLinksInContainer(
  next,
  4,
  4,
  10
);
assert.equal(inside, null);

const updates = patchUpdatesForContainer(next, null);
assert.equal(updates.length, 4);
assert.ok(updates.every((u) => u.folder_id === null || u.id === 10));

console.log('test-dashboard-reorder: superato');
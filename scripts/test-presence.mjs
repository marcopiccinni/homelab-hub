#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  presenceStatus,
  presenceLabel,
  presenceTooltip,
  enrichAssetPresence,
  PRESENCE_ONLINE_DAYS,
} from '../src/lib/assets/presence.js';

const now = new Date('2026-06-10T12:00:00');

assert.equal(presenceStatus(null, now), 'never');
assert.equal(presenceLabel('never', null), 'Mai rilevato');

const recent = new Date(now);
recent.setDate(recent.getDate() - 2);
const recentIso = recent.toISOString().slice(0, 19).replace('T', ' ');
assert.equal(presenceStatus(recentIso, now), 'online');
assert.equal(presenceLabel('online', recentIso), 'Online');

const old = new Date(now);
old.setDate(old.getDate() - (PRESENCE_ONLINE_DAYS + 3));
const oldIso = old.toISOString().slice(0, 19).replace('T', ' ');
assert.equal(presenceStatus(oldIso, now), 'stale');
assert.match(presenceLabel('stale', oldIso), /Non visto/);

const tip = presenceTooltip(null, null);
assert.match(tip, /Excel/);
assert.match(presenceTooltip(recentIso, 'mercusys'), /Mercusys/);

const enriched = enrichAssetPresence({ id: 1, last_seen_at: null, last_seen_source: null });
assert.equal(enriched.presence_status, 'never');
assert.equal(enriched.is_online, 0);

console.log('test-presence: OK');
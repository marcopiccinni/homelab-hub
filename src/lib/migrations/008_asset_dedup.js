import {
  mergeAssetInto,
  scoreAssetForCanonical,
} from '../assets/asset-merge.js';

function pickCanonicalId(db, assetIds) {
  let best = assetIds[0];
  let bestScore = scoreAssetForCanonical(db, best);
  for (const id of assetIds.slice(1)) {
    const s = scoreAssetForCanonical(db, id);
    if (s > bestScore) {
      best = id;
      bestScore = s;
    }
  }
  return best;
}

function dedupBySharedIp(db) {
  const groups = db
    .prepare(
      `SELECT i.address, i.id AS ip_id, GROUP_CONCAT(DISTINCT aia.asset_id) AS asset_ids
       FROM ip_addresses i
       JOIN asset_ip_assignments aia ON aia.ip_id = i.id
       JOIN assets a ON a.id = aia.asset_id AND a.status = 'active'
       GROUP BY i.id
       HAVING COUNT(DISTINCT aia.asset_id) > 1`
    )
    .all();

  let merges = 0;
  for (const g of groups) {
    const ids = g.asset_ids.split(',').map((x) => parseInt(x, 10));
    const canonical = pickCanonicalId(db, ids);
    for (const dup of ids) {
      if (dup === canonical) continue;
      const r = mergeAssetInto(db, canonical, dup, {
        reason: 'migration_ip',
        matchKey: `ip:${g.address}`,
      });
      if (r.merged) merges += 1;
    }
  }
  return merges;
}

function dedupBySharedMac(db) {
  const groups = db
    .prepare(
      `SELECT ai.mac_address, GROUP_CONCAT(DISTINCT ai.asset_id) AS asset_ids
       FROM asset_interfaces ai
       JOIN assets a ON a.id = ai.asset_id AND a.status = 'active'
       WHERE ai.mac_address IS NOT NULL AND ai.mac_address != ''
       GROUP BY ai.mac_address
       HAVING COUNT(DISTINCT ai.asset_id) > 1`
    )
    .all();

  let merges = 0;
  for (const g of groups) {
    const ids = [...new Set(g.asset_ids.split(',').map((x) => parseInt(x, 10)))].filter((id) => {
      const row = db.prepare(`SELECT status FROM assets WHERE id=?`).get(id);
      return row?.status === 'active';
    });
    if (ids.length < 2) continue;
    const canonical = pickCanonicalId(db, ids);
    for (const dup of ids) {
      if (dup === canonical) continue;
      const stillActive = db.prepare(`SELECT status FROM assets WHERE id=?`).get(dup)?.status === 'active';
      if (!stillActive) continue;
      const r = mergeAssetInto(db, canonical, dup, {
        reason: 'migration_mac',
        matchKey: `mac:${g.mac_address}`,
      });
      if (r.merged) merges += 1;
    }
  }
  return merges;
}

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_merge_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_asset_id INTEGER NOT NULL REFERENCES assets(id),
      merged_asset_id INTEGER NOT NULL,
      match_key TEXT,
      reason TEXT NOT NULL,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const scanCols = db.prepare('PRAGMA table_info(scan_jobs)').all().map((c) => c.name);
  if (!scanCols.includes('updated_at')) {
    db.exec(`ALTER TABLE scan_jobs ADD COLUMN updated_at TEXT`);
  }
  if (!scanCols.includes('cancel_requested')) {
    db.exec(`ALTER TABLE scan_jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0`);
  }

  const ipMerges = dedupBySharedIp(db);
  const macMerges = dedupBySharedMac(db);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_ip_one_holder ON asset_ip_assignments(ip_id)`
  );
  console.log(`Migration 008: merged ${ipMerges} by IP, ${macMerges} by MAC`);
}
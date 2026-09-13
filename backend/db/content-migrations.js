// Additive and shared across database drivers. Existing media bytes remain untouched.
const columns = { vip_posts: { crop_data: 'TEXT' }, creator_profiles: { avatar_crop: 'TEXT', cover_crop: 'TEXT' } };
async function migrate(db, postgres = false) {
  for (const [table, fields] of Object.entries(columns)) {
    const existing = postgres ? null : new Set((await db.all(`PRAGMA table_info(${table})`)).map(c => c.name));
    for (const [field, type] of Object.entries(fields)) {
      if (!existing || !existing.has(field)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${postgres ? 'IF NOT EXISTS ' : ''}${field} ${type}`);
    }
  }
}
module.exports = { migrate };

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL || 'postgresql://scythe:scythe@localhost:5432/scythe');

(async () => {
  try {
    await sql`CREATE TYPE verification_status AS ENUM ('unverified', 'verified', 'rejected')`;
    console.log('Created verification_status enum type');
  } catch (e) {
    console.log('Enum type already exists, skipping');
  }

  try {
    await sql`ALTER TABLE deceased_persons ADD COLUMN verification_status verification_status DEFAULT 'verified'`;
    console.log('Added verification_status column to deceased_persons');
  } catch (e) {
    console.log('Column already exists or error:', e.message);
  }

  await sql.end();
  console.log('Done');
})();

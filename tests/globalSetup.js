/** Runs once before the suite: rebuilds the test database from migrations and seeds it. */
export async function setup() {
  process.env.NODE_ENV = 'test';
  const { default: knex } = await import('knex');
  const { default: config } = await import('../knexfile.js');

  const db = knex(config);
  try {
    await db.migrate.rollback(undefined, true);
    await db.migrate.latest();
    await db.seed.run();
  } finally {
    await db.destroy();
  }
}

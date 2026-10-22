import env from './src/config/env.js';

/** @type {import('knex').Knex.Config} */
export default {
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    // Verify the server certificate: hosted Postgres (Neon) is reached over the public internet.
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    // Bound how long a query, or a transaction holding the submit row lock, can tie up a connection.
    // Sent as libpq startup `options`: Neon's proxy silently drops pg's separate statement_timeout fields,
    // but honours this on its direct endpoint (and rejects it on the pooled one rather than ignoring it).
    options: '-c statement_timeout=10000 -c idle_in_transaction_session_timeout=10000',
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './src/db/migrations',
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },
  seeds: {
    directory: './src/db/seeds',
    loadExtensions: ['.js'],
  },
};

import env from './src/config/env.js';

/** @type {import('knex').Knex.Config} */
export default {
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    // Bound how long a query, or a transaction holding the submit row lock, can tie up a connection.
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
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

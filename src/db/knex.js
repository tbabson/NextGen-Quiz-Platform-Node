import knex from 'knex';
import pg from 'pg';
import config from '../../knexfile.js';

// Return BIGINT aggregates such as COUNT(*) as JS numbers. Counts in this app stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

const db = knex(config);

export default db;

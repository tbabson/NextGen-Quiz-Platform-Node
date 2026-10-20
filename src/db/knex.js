import knex from 'knex';
import pg from 'pg';
import config from '../../knexfile.js';
import logger from '../config/logger.js';

// Return BIGINT aggregates such as COUNT(*) as JS numbers. Counts in this app stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

// Route Knex's own console output through pino. Connection failures already surface on the failing
// request's log line, so Knex's copy ("Acquire connection error", sent as a warning) drops to debug.
const knexLogger = logger.child({ component: 'knex' });
const isConnectionNoise = (message) => String(message).startsWith('Acquire connection error');

const db = knex({
  ...config,
  log: {
    warn: (message) => (isConnectionNoise(message) ? knexLogger.debug(message) : knexLogger.warn(message)),
    error: (message) => knexLogger.debug(message),
    deprecate: (message) => knexLogger.warn(message),
    debug: (message) => knexLogger.debug(message),
  },
});

export default db;

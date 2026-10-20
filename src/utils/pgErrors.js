// PostgreSQL SQLSTATE for unique_violation (Prisma surfaces the same thing as P2002).
const UNIQUE_VIOLATION = '23505';

/** True when `error` is a unique violation, optionally on a specific named constraint. */
export function isUniqueViolation(error, constraint) {
  return error?.code === UNIQUE_VIOLATION && (constraint === undefined || error.constraint === constraint);
}

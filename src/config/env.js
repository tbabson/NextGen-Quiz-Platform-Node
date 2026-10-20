import dotenv from 'dotenv';
import { z } from 'zod';

// Tests read .env.test so they can never touch the development database. Real environment variables
// always win over file values (dotenv does not override), which is how CI and hosts inject config.
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

// Accepts "true"/"false"/"1"/"0" from the environment; z.coerce.boolean() would treat "false" as true.
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_SSL: booleanFromString.default('false'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // Comma-separated list of allowed browser origins, e.g. "https://quiz.example.com,http://localhost:5173".
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
  COOKIE_SECURE: booleanFromString.optional(),
  // "none" is needed when the client and API live on different sites (e.g. two *.onrender.com hosts).
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  // Number of reverse proxies in front of the app (Render, Nginx). Needed for correct client IPs in rate limiting.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SUBMIT_PER_MIN: z.coerce.number().int().positive().default(10),
}).superRefine((env, ctx) => {
  const production = env.NODE_ENV === 'production';
  const secureCookies = env.COOKIE_SECURE ?? production;

  if (production && /change-me|dev-only|test-only/.test(env.JWT_ACCESS_SECRET)) {
    ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Placeholder secret used in production; generate a random one.' });
  }
  // Browsers drop SameSite=None cookies that are not Secure, which would silently break refresh.
  if (env.COOKIE_SAMESITE === 'none' && !secureCookies) {
    ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true (HTTPS).' });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  // The logger depends on this module, so fail loudly on stderr instead.
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
  process.exit(1);
}

const env = parsed.data;

export default Object.freeze({
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  // Secure cookies by default in production; can be forced either way.
  COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
});

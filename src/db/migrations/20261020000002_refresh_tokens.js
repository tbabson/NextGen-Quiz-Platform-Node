/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored, so a database leak
 * does not yield usable sessions. Tokens issued from one login share a family_id: presenting an
 * already-rotated token is treated as theft and revokes the whole family.
 */

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE refresh_tokens (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash  text        NOT NULL,
      family_id   uuid        NOT NULL,
      expires_at  timestamptz NOT NULL,
      revoked_at  timestamptz,
      replaced_by uuid        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
    );

    CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
    CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
  `);
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS refresh_tokens;');
}

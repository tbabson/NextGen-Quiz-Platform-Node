/**
 * Core schema. Written as plain SQL so every constraint the brief asks for is visible in one place
 * and enforced by PostgreSQL itself, not only by application code.
 */

export async function up(knex) {
  await knex.raw(`
    -- gen_random_uuid() is built into PostgreSQL 13+.

    CREATE TABLE users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      email         text        NOT NULL CHECK (email = lower(email)),
      password_hash text        NOT NULL,
      xp            integer     NOT NULL DEFAULT 0 CHECK (xp >= 0),
      -- When the user reached their current XP. Leaderboard tie-breaker: earliest to reach a score ranks higher.
      xp_updated_at timestamptz NOT NULL DEFAULT now(),
      created_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_key UNIQUE (email)
    );

    CREATE INDEX users_leaderboard_idx ON users (xp DESC, xp_updated_at ASC);

    CREATE TABLE quizzes (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug           text        NOT NULL,
      title          text        NOT NULL,
      description    text        NOT NULL DEFAULT '',
      xp_per_correct integer     NOT NULL DEFAULT 10 CHECK (xp_per_correct > 0),
      created_at     timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT quizzes_slug_key UNIQUE (slug)
    );

    CREATE TABLE questions (
      id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id  uuid    NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
      text     text    NOT NULL,
      position integer NOT NULL CHECK (position > 0),
      CONSTRAINT questions_quiz_position_key UNIQUE (quiz_id, position)
    );

    CREATE TABLE options (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id uuid     NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
      text        text     NOT NULL,
      is_correct  boolean  NOT NULL DEFAULT false,
      position    smallint NOT NULL CHECK (position > 0),
      CONSTRAINT options_question_position_key UNIQUE (question_id, position)
    );

    -- At most one correct option per question...
    CREATE UNIQUE INDEX options_one_correct_per_question
      ON options (question_id) WHERE is_correct;

    -- ...and at least one, checked at COMMIT so a question and its options can be written in one transaction.
    CREATE FUNCTION enforce_exactly_one_correct_option() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      affected      uuid[];
      qid           uuid;
      correct_count integer;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        affected := ARRAY[OLD.question_id];
      ELSIF TG_OP = 'UPDATE' THEN
        affected := ARRAY[OLD.question_id, NEW.question_id];
      ELSE
        affected := ARRAY[NEW.question_id];
      END IF;

      FOREACH qid IN ARRAY affected LOOP
        -- The question itself was deleted (cascade); nothing left to validate.
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM questions WHERE id = qid);

        SELECT count(*) INTO correct_count FROM options WHERE question_id = qid AND is_correct;
        IF correct_count <> 1 THEN
          RAISE EXCEPTION 'question % must have exactly one correct option (found %)', qid, correct_count
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;

      RETURN NULL;
    END;
    $$;

    CREATE CONSTRAINT TRIGGER options_exactly_one_correct
      AFTER INSERT OR UPDATE OR DELETE ON options
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_exactly_one_correct_option();

    CREATE TABLE attempts (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      -- RESTRICT: deleting a quiz must not silently erase students' history and earned XP records.
      quiz_id         uuid        NOT NULL REFERENCES quizzes (id) ON DELETE RESTRICT,
      score           integer     NOT NULL,
      total           integer     NOT NULL CHECK (total > 0),
      xp_awarded      integer     NOT NULL CHECK (xp_awarded >= 0),
      -- Snapshot of what was submitted and how each answer was graded: [{question_id, option_id, is_correct}].
      answers         jsonb       NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
      idempotency_key text        NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
      submitted_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT attempts_score_range CHECK (score BETWEEN 0 AND total),
      -- One rewarded completion per user per quiz; a repeat is rejected with 409.
      CONSTRAINT attempts_user_quiz_key UNIQUE (user_id, quiz_id),
      -- Replaying the same Idempotency-Key returns the stored attempt instead of creating a new one.
      CONSTRAINT attempts_idempotency_key_key UNIQUE (idempotency_key)
    );

    CREATE INDEX attempts_user_submitted_idx ON attempts (user_id, submitted_at DESC);

    CREATE TABLE badges (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code        text        NOT NULL,
      name        text        NOT NULL,
      description text        NOT NULL,
      -- Declarative rule evaluated by badge.service, e.g. {"type": "xp_at_least", "value": 100}.
      rule        jsonb       NOT NULL CHECK (jsonb_typeof(rule) = 'object'),
      created_at  timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT badges_code_key UNIQUE (code)
    );

    CREATE TABLE user_badges (
      user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      badge_id   uuid        NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
      -- The attempt that earned the badge, so an idempotent replay can return the same badges.
      attempt_id uuid        REFERENCES attempts (id) ON DELETE SET NULL,
      awarded_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, badge_id)
    );

    CREATE INDEX user_badges_attempt_idx ON user_badges (attempt_id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS user_badges;
    DROP TABLE IF EXISTS badges;
    DROP TABLE IF EXISTS attempts;
    DROP TRIGGER IF EXISTS options_exactly_one_correct ON options;
    DROP FUNCTION IF EXISTS enforce_exactly_one_correct_option();
    DROP TABLE IF EXISTS options;
    DROP TABLE IF EXISTS questions;
    DROP TABLE IF EXISTS quizzes;
    DROP TABLE IF EXISTS users;
  `);
}

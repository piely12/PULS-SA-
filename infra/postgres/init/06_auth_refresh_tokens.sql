-- Stockage des jetons de renouvellement sous forme de hash uniquement.
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx
  ON auth_refresh_tokens (user_id, expires_at);

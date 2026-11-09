-- Verbali immutabili e revisione corrente: restano nel database di raccolta.
CREATE TABLE IF NOT EXISTS prompt_validations(
  id TEXT PRIMARY KEY, prompt TEXT NOT NULL, recorded_at TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json))
) STRICT;
CREATE TABLE IF NOT EXISTS prompt_validation_heads(
  prompt TEXT PRIMARY KEY, validation_id TEXT NOT NULL REFERENCES prompt_validations(id)
) STRICT;

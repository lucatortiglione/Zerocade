-- Le previsioni NLP non alimentano inventory_terms né inventory_attestations.
CREATE TABLE IF NOT EXISTS nlp_models(
 id TEXT PRIMARY KEY,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json))
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS nlp_analyses(
 id TEXT PRIMARY KEY,
 model_id TEXT NOT NULL REFERENCES nlp_models(id),
 context TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('contextual','isolated')),
 tokens_json TEXT NOT NULL CHECK(json_valid(tokens_json)),
 analyzed_at TEXT NOT NULL,
 UNIQUE(model_id,context,scope)
) STRICT, WITHOUT ROWID;

-- Inventario del primo step: nessuna associazione e nessuna approvazione implicita.
CREATE TABLE IF NOT EXISTS inventory_sources(
 source_key TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
 url TEXT NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_snapshots(
 id TEXT PRIMARY KEY, source_key TEXT NOT NULL REFERENCES inventory_sources(source_key),
 sha256 TEXT NOT NULL, acquired_at TEXT NOT NULL, cache_path TEXT NOT NULL,
 records INTEGER NOT NULL CHECK(records>=0),
 source_config_json TEXT NOT NULL CHECK(json_valid(source_config_json)),
 UNIQUE(source_key,sha256)
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_terms(
 prompt TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1)),
 has_lemma_evidence INTEGER NOT NULL CHECK(has_lemma_evidence IN (0,1)),
 has_inflected_evidence INTEGER NOT NULL CHECK(has_inflected_evidence IN (0,1)),
 has_proper_name_evidence INTEGER NOT NULL CHECK(has_proper_name_evidence IN (0,1)),
 has_it_dictionary_evidence INTEGER NOT NULL CHECK(has_it_dictionary_evidence IN (0,1)),
 review_status TEXT NOT NULL DEFAULT 'COLLECTED' CHECK(review_status='COLLECTED')
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestations(
 prompt TEXT NOT NULL REFERENCES inventory_terms(prompt),
 snapshot_id TEXT NOT NULL REFERENCES inventory_snapshots(id),
 locator TEXT NOT NULL, role TEXT NOT NULL, pos TEXT NOT NULL,
 source_form TEXT NOT NULL, lemma TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 PRIMARY KEY(snapshot_id,prompt,locator,role)
) STRICT;
CREATE INDEX IF NOT EXISTS inventory_attestations_by_prompt ON inventory_attestations(prompt);
CREATE VIEW IF NOT EXISTS inventory_source_counts AS
 SELECT s.source_key,s.name,count(*) AS attestations,
 count(DISTINCT a.prompt) AS distinct_prompts
 FROM inventory_sources s JOIN inventory_snapshots v ON v.source_key=s.source_key
 JOIN inventory_attestations a ON a.snapshot_id=v.id GROUP BY s.source_key;
CREATE VIEW IF NOT EXISTS inventory_pending_single_words AS
 SELECT t.* FROM inventory_terms t
 WHERE t.is_single_word=1 AND NOT EXISTS(SELECT 1 FROM prompts p WHERE p.lemma=t.prompt);

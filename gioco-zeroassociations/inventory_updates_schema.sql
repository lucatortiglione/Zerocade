-- Registro e decisioni nello stesso database dell'inventario e della banca di gioco.
CREATE TABLE IF NOT EXISTS inventory_registered_sources(
 source_key TEXT PRIMARY KEY REFERENCES inventory_sources(source_key),
 config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_source_heads(
 source_key TEXT PRIMARY KEY REFERENCES inventory_sources(source_key),
 snapshot_id TEXT NOT NULL REFERENCES inventory_snapshots(id)
) STRICT;
CREATE INDEX IF NOT EXISTS inventory_snapshots_by_source_date ON inventory_snapshots(source_key,acquired_at,id);
INSERT OR IGNORE INTO inventory_source_heads
 SELECT s.source_key,s.id FROM inventory_snapshots s WHERE NOT EXISTS(
  SELECT 1 FROM inventory_snapshots newer WHERE newer.source_key=s.source_key
   AND (newer.acquired_at>s.acquired_at OR (newer.acquired_at=s.acquired_at AND newer.id>s.id)));
INSERT OR IGNORE INTO inventory_registered_sources
 SELECT h.source_key,s.source_config_json,1 FROM inventory_source_heads h
 JOIN inventory_snapshots s ON s.id=h.snapshot_id;

CREATE TABLE IF NOT EXISTS inventory_snapshot_terms(
 snapshot_id TEXT NOT NULL REFERENCES inventory_snapshots(id),
 prompt TEXT NOT NULL REFERENCES inventory_terms(prompt), fingerprint TEXT NOT NULL,
 PRIMARY KEY(snapshot_id,prompt)
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_updates(
 id TEXT PRIMARY KEY,source_key TEXT NOT NULL REFERENCES inventory_sources(source_key),
 base_snapshot_id TEXT REFERENCES inventory_snapshots(id),
 sha256 TEXT NOT NULL,cache_path TEXT NOT NULL,config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 detected_at TEXT NOT NULL,decision_at TEXT,reason TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('PENDING','DEFERRED','APPLIED','DISCARDED')),
 records INTEGER NOT NULL,new_terms INTEGER NOT NULL,changed_terms INTEGER NOT NULL,
 removed_terms INTEGER NOT NULL,unchanged_terms INTEGER NOT NULL,
 UNIQUE(source_key,base_snapshot_id,sha256)
) STRICT;
CREATE INDEX IF NOT EXISTS inventory_updates_by_content ON inventory_updates(source_key,sha256,detected_at);
CREATE TABLE IF NOT EXISTS inventory_update_rows(
 update_id TEXT NOT NULL REFERENCES inventory_updates(id),prompt TEXT NOT NULL,
 source_form TEXT NOT NULL,locator TEXT NOT NULL,role TEXT NOT NULL,pos TEXT NOT NULL,lemma TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 is_single_word INTEGER NOT NULL,is_lemma INTEGER NOT NULL,is_inflected INTEGER NOT NULL,
 is_proper INTEGER NOT NULL,it_evidence INTEGER NOT NULL,
 PRIMARY KEY(update_id,prompt,locator,role)
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_update_terms(
 update_id TEXT NOT NULL REFERENCES inventory_updates(id),prompt TEXT NOT NULL,
 fingerprint TEXT NOT NULL,is_single_word INTEGER NOT NULL,
 is_lemma INTEGER NOT NULL,is_inflected INTEGER NOT NULL,is_proper INTEGER NOT NULL,it_evidence INTEGER NOT NULL,
 PRIMARY KEY(update_id,prompt)
) STRICT;
CREATE INDEX IF NOT EXISTS inventory_update_terms_by_prompt ON inventory_update_terms(prompt);
CREATE TABLE IF NOT EXISTS inventory_update_changes(
 update_id TEXT NOT NULL REFERENCES inventory_updates(id),prompt TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('NEW','CHANGED','REMOVED','UNCHANGED')),
 PRIMARY KEY(update_id,prompt)
) STRICT;
CREATE INDEX IF NOT EXISTS inventory_update_changes_by_kind ON inventory_update_changes(update_id,kind,prompt);
CREATE TABLE IF NOT EXISTS inventory_term_decisions(
 prompt TEXT PRIMARY KEY,decision TEXT NOT NULL CHECK(decision IN ('INTEGRATED','DISCARDED','DEFERRED')),
 reason TEXT NOT NULL,actor TEXT NOT NULL,decided_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_decision_history(
 id INTEGER PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('TERM','UPDATE')),
 subject_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,decided_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_http_cache(
 source_key TEXT NOT NULL REFERENCES inventory_sources(source_key),url TEXT NOT NULL,
 etag TEXT,last_modified TEXT,cache_path TEXT NOT NULL,sha256 TEXT NOT NULL,checked_at TEXT NOT NULL,
 PRIMARY KEY(source_key,url)
) STRICT;
CREATE VIEW IF NOT EXISTS inventory_current_attestations AS
 SELECT a.* FROM inventory_attestations a JOIN inventory_source_heads h ON h.snapshot_id=a.snapshot_id;
DROP VIEW IF EXISTS inventory_catalog;
CREATE VIEW inventory_catalog AS
 SELECT w.prompt,max(w.is_single_word) AS is_single_word,max(w.in_inventory) AS in_inventory,
 coalesce(d.decision,'COLLECTED') AS decision,d.reason,d.decided_at,
 EXISTS(SELECT 1 FROM prompts p WHERE p.lemma=w.prompt) AS has_verified_pool
 FROM (
  SELECT prompt,is_single_word,1 AS in_inventory FROM inventory_terms
  UNION ALL
  SELECT prompt,is_single_word,0 FROM inventory_update_terms
  UNION ALL
  SELECT lemma,1,1 FROM prompts
 ) w LEFT JOIN inventory_term_decisions d ON d.prompt=w.prompt GROUP BY w.prompt;
DROP VIEW IF EXISTS inventory_review_queue;
CREATE VIEW inventory_review_queue AS
 SELECT c.* FROM inventory_catalog c WHERE decision IN ('COLLECTED','DEFERRED') AND
 (in_inventory=1 OR EXISTS(SELECT 1 FROM inventory_update_terms t JOIN inventory_updates u ON u.id=t.update_id
                          WHERE t.prompt=c.prompt AND u.status IN ('PENDING','DEFERRED')));
CREATE VIEW IF NOT EXISTS inventory_integrated_terms AS
 SELECT * FROM inventory_catalog WHERE decision='INTEGRATED';
DROP VIEW IF EXISTS inventory_pending_single_words;
CREATE VIEW inventory_pending_single_words AS
 SELECT t.* FROM inventory_terms t WHERE t.is_single_word=1
 AND NOT EXISTS(SELECT 1 FROM prompts p WHERE p.lemma=t.prompt)
 AND NOT EXISTS(SELECT 1 FROM inventory_term_decisions d WHERE d.prompt=t.prompt
                AND d.decision IN ('DISCARDED','DEFERRED'));

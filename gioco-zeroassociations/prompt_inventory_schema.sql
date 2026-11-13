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
-- Le voci sono milioni: la tabella è WITHOUT ROWID (la chiave è la voce, niente indice a parte per lei), e
-- review_status, che nell'inventario vale sempre COLLECTED, è una colonna generata che non occupa spazio. Si
-- inseriscono le altre colonne. prompt_inventory.migrate_terms converte i database del vecchio formato usando
-- le istruzioni fra i due segni qui sotto.
-- voci:tabella
CREATE TABLE IF NOT EXISTS inventory_terms(
 prompt TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1)),
 has_lemma_evidence INTEGER NOT NULL CHECK(has_lemma_evidence IN (0,1)),
 has_inflected_evidence INTEGER NOT NULL CHECK(has_inflected_evidence IN (0,1)),
 has_proper_name_evidence INTEGER NOT NULL CHECK(has_proper_name_evidence IN (0,1)),
 has_it_dictionary_evidence INTEGER NOT NULL CHECK(has_it_dictionary_evidence IN (0,1)),
 review_status TEXT GENERATED ALWAYS AS ('COLLECTED') VIRTUAL
) STRICT, WITHOUT ROWID;
-- voci:fine
-- Le attestazioni sono milioni di righe con pochi valori ripetuti: lo snapshot (poche decine di id di 64
-- caratteri), il ruolo (una manciata) e la categoria grammaticale della fonte (qualche migliaio) stanno in
-- tabelle di lookup e ogni riga ne porta il numero; la forma della fonte si salva solo quando è diversa dalla
-- voce (NULL vuol dire uguale). Con la chiave fatta di numeri la tabella è WITHOUT ROWID: niente indice a parte
-- per la chiave. La vista inventory_attestations le mostra come prima, con i testi: si legge e si inserisce
-- sempre da lì. prompt_inventory.migrate_attestations converte i database del vecchio formato usando le
-- istruzioni fra i due segni qui sotto.
-- attestazioni:tabelle
CREATE TABLE IF NOT EXISTS inventory_snapshot_numbers(
 n INTEGER PRIMARY KEY, snapshot_id TEXT NOT NULL UNIQUE REFERENCES inventory_snapshots(id)
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_roles(n INTEGER PRIMARY KEY, role TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_pos(n INTEGER PRIMARY KEY, pos TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS inventory_attestation_rows(
 snapshot INTEGER NOT NULL REFERENCES inventory_snapshot_numbers(n),
 prompt TEXT NOT NULL REFERENCES inventory_terms(prompt),
 locator TEXT NOT NULL,
 role INTEGER NOT NULL REFERENCES inventory_attestation_roles(n),
 pos INTEGER NOT NULL REFERENCES inventory_attestation_pos(n),
 source_form TEXT, lemma TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 PRIMARY KEY(snapshot,prompt,locator,role)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS inventory_attestations_by_prompt ON inventory_attestation_rows(prompt);
-- attestazioni:vista
CREATE VIEW IF NOT EXISTS inventory_attestations AS
 SELECT a.prompt,s.snapshot_id,a.locator,r.role,p.pos,coalesce(a.source_form,a.prompt) AS source_form,a.lemma,a.details_json
 FROM inventory_attestation_rows a JOIN inventory_snapshot_numbers s ON s.n=a.snapshot
 JOIN inventory_attestation_roles r ON r.n=a.role JOIN inventory_attestation_pos p ON p.n=a.pos;
CREATE TRIGGER IF NOT EXISTS inventory_attestations_insert INSTEAD OF INSERT ON inventory_attestations BEGIN
 SELECT RAISE(ABORT,'NOT NULL constraint failed: inventory_attestations.source_form') WHERE NEW.source_form IS NULL;
 INSERT INTO inventory_snapshot_numbers(snapshot_id) SELECT NEW.snapshot_id
  WHERE NOT EXISTS(SELECT 1 FROM inventory_snapshot_numbers WHERE snapshot_id=NEW.snapshot_id);
 INSERT INTO inventory_attestation_roles(role) SELECT NEW.role
  WHERE NOT EXISTS(SELECT 1 FROM inventory_attestation_roles WHERE role=NEW.role);
 INSERT INTO inventory_attestation_pos(pos) SELECT NEW.pos
  WHERE NOT EXISTS(SELECT 1 FROM inventory_attestation_pos WHERE pos=NEW.pos);
 INSERT INTO inventory_attestation_rows VALUES(
  (SELECT n FROM inventory_snapshot_numbers WHERE snapshot_id=NEW.snapshot_id),NEW.prompt,NEW.locator,
  (SELECT n FROM inventory_attestation_roles WHERE role=NEW.role),
  (SELECT n FROM inventory_attestation_pos WHERE pos=NEW.pos),
  nullif(NEW.source_form,NEW.prompt),NEW.lemma,NEW.details_json);
END;
CREATE TRIGGER IF NOT EXISTS inventory_attestations_delete INSTEAD OF DELETE ON inventory_attestations BEGIN
 DELETE FROM inventory_attestation_rows WHERE prompt=OLD.prompt AND locator=OLD.locator
  AND snapshot=(SELECT n FROM inventory_snapshot_numbers WHERE snapshot_id=OLD.snapshot_id)
  AND role=(SELECT n FROM inventory_attestation_roles WHERE role=OLD.role);
END;
-- attestazioni:fine
CREATE VIEW IF NOT EXISTS inventory_source_counts AS
 SELECT s.source_key,s.name,count(*) AS attestations,
 count(DISTINCT a.prompt) AS distinct_prompts
 FROM inventory_sources s JOIN inventory_snapshots v ON v.source_key=s.source_key
 JOIN inventory_attestations a ON a.snapshot_id=v.id GROUP BY s.source_key;
CREATE VIEW IF NOT EXISTS inventory_pending_single_words AS
 SELECT t.* FROM inventory_terms t
 WHERE t.is_single_word=1 AND NOT EXISTS(SELECT 1 FROM prompts p WHERE p.lemma=t.prompt);

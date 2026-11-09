-- Sorgente dello schema; prompt.sqlite3 (bacini del gioco) viene esportato dalla raccolta prompt_raw.sqlite3.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS categories(
  category_id TEXT PRIMARY KEY, category_name TEXT NOT NULL,
  cluster_id TEXT NOT NULL, cluster_name TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sources(
  id TEXT PRIMARY KEY, url TEXT NOT NULL, license TEXT NOT NULL,
  attribution TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS reviews(
  id TEXT PRIMARY KEY, reviewer TEXT NOT NULL, method TEXT NOT NULL,
  reviewed_at TEXT NOT NULL, directives_sha256 TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL UNIQUE,
  decision TEXT NOT NULL CHECK(decision='verified'),
  human_review INTEGER NOT NULL CHECK(human_review IN (0,1)),
  independent_gameplay_qa INTEGER NOT NULL CHECK(independent_gameplay_qa=0),
  record_json TEXT NOT NULL CHECK(json_valid(record_json))
) STRICT;
CREATE TABLE IF NOT EXISTS prompts(
  lemma TEXT PRIMARY KEY, language TEXT NOT NULL CHECK(language IN ('it','common_loanword')),
  familiar_sense TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES reviews(id),
  category_id TEXT NOT NULL REFERENCES categories(category_id)
) STRICT;
CREATE TABLE IF NOT EXISTS senses(
  id TEXT PRIMARY KEY, prompt TEXT NOT NULL REFERENCES prompts(lemma),
  description TEXT NOT NULL, pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  category_id TEXT NOT NULL REFERENCES categories(category_id), review_id TEXT NOT NULL REFERENCES reviews(id),
  UNIQUE(prompt,description)
) STRICT;
CREATE TABLE IF NOT EXISTS associations(
  sense_id TEXT NOT NULL REFERENCES senses(id), word TEXT NOT NULL,
  relation TEXT NOT NULL, rationale TEXT NOT NULL CHECK(length(rationale)>=20),
  answer_sense TEXT NOT NULL, meaning_group TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard','unrated')),
  difficulty_basis TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES reviews(id),
  PRIMARY KEY(sense_id,word)
) STRICT;
CREATE INDEX IF NOT EXISTS associations_by_word ON associations(word);
CREATE INDEX IF NOT EXISTS associations_by_difficulty ON associations(difficulty,sense_id);
CREATE TABLE IF NOT EXISTS evidence(
  review_id TEXT NOT NULL REFERENCES reviews(id), source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL, scope TEXT NOT NULL, note TEXT NOT NULL,
  PRIMARY KEY(review_id,source_id,url,scope)
) STRICT;
CREATE TABLE IF NOT EXISTS group_limits(
  sense_id TEXT NOT NULL REFERENCES senses(id), meaning_group TEXT NOT NULL,
  maximum INTEGER NOT NULL CHECK(maximum IN (1,2)), PRIMARY KEY(sense_id,meaning_group)
) STRICT;
CREATE TABLE IF NOT EXISTS conflicts(
  sense_id TEXT NOT NULL, word_a TEXT NOT NULL, word_b TEXT NOT NULL,
  reason TEXT NOT NULL, CHECK(word_a<word_b), PRIMARY KEY(sense_id,word_a,word_b),
  FOREIGN KEY(sense_id,word_a) REFERENCES associations(sense_id,word),
  FOREIGN KEY(sense_id,word_b) REFERENCES associations(sense_id,word)
) STRICT;
CREATE VIEW IF NOT EXISTS pool_sizes AS
 SELECT s.id AS sense_id,s.prompt,s.description,count(a.word) AS association_count
 FROM senses s JOIN associations a ON a.sense_id=s.id GROUP BY s.id;
CREATE TRIGGER IF NOT EXISTS no_prompt_as_answer BEFORE INSERT ON associations
 WHEN NEW.word=(SELECT prompt FROM senses WHERE id=NEW.sense_id)
 BEGIN SELECT RAISE(ABORT,'Il prompt non può essere una risposta'); END;

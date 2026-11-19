
CREATE TABLE words(id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE metric_names(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE subset_names(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE profiles(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, origin TEXT NOT NULL, vectors_sha256 TEXT NOT NULL,
  dim INTEGER NOT NULL, words INTEGER NOT NULL, UNIQUE(name, vectors_sha256)) STRICT;
CREATE TABLE runs(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_corso','completa','annullata')),
  evaluator_version TEXT NOT NULL, judge_version TEXT, split_rule TEXT NOT NULL,
  reference_sha256 TEXT NOT NULL, gold_sha256 TEXT NOT NULL) STRICT;
CREATE TABLE run_top(
  run_id INTEGER NOT NULL REFERENCES runs(id), secret_id INTEGER NOT NULL REFERENCES words(id),
  position INTEGER NOT NULL CHECK(position BETWEEN 2 AND 21), word_id INTEGER NOT NULL REFERENCES words(id),
  verified INTEGER NOT NULL CHECK(verified IN (0,1)), variant INTEGER NOT NULL CHECK(variant IN (0,1)),
  PRIMARY KEY(run_id, secret_id, position)) STRICT, WITHOUT ROWID;
CREATE TABLE sample(
  secret_id INTEGER PRIMARY KEY REFERENCES words(id), has_gold INTEGER NOT NULL CHECK(has_gold IN (0,1)),
  block INTEGER NOT NULL, seed INTEGER NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE judge_verdicts(
  secret_id INTEGER NOT NULL REFERENCES words(id), word_id INTEGER NOT NULL REFERENCES words(id),
  judge_version TEXT NOT NULL, model TEXT NOT NULL,
  grade INTEGER NOT NULL CHECK(grade IN (0,1,2)), sense_ok INTEGER CHECK(sense_ok IS NULL OR sense_ok IN (0,1)),
  reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(secret_id, word_id, judge_version, model)) STRICT, WITHOUT ROWID;
CREATE TABLE human_verdicts(
  secret_id INTEGER NOT NULL REFERENCES words(id), word_id INTEGER NOT NULL REFERENCES words(id),
  verdict TEXT NOT NULL CHECK(verdict IN ('naturale','non_naturale','non_so')), updated_at TEXT NOT NULL,
  PRIMARY KEY(secret_id, word_id)) STRICT, WITHOUT ROWID;
CREATE TABLE run_metrics(
  run_id INTEGER NOT NULL REFERENCES runs(id), metric_id INTEGER NOT NULL REFERENCES metric_names(id),
  subset_id INTEGER NOT NULL REFERENCES subset_names(id),
  value REAL, low REAL, high REAL, n INTEGER NOT NULL,
  PRIMARY KEY(run_id, metric_id, subset_id)) STRICT, WITHOUT ROWID;
CREATE TABLE run_secret_metrics(
  run_id INTEGER NOT NULL REFERENCES runs(id), secret_id INTEGER NOT NULL REFERENCES words(id),
  metric_id INTEGER NOT NULL REFERENCES metric_names(id), value REAL,
  PRIMARY KEY(run_id, secret_id, metric_id)) STRICT, WITHOUT ROWID;

CREATE VIEW v_runs AS
  SELECT r.id AS id, p.name AS profilo, r.status AS status, r.created_at AS created_at, r.finished_at AS finished_at,
         r.judge_version AS judge_version, r.evaluator_version AS evaluator_version, r.split_rule AS split_rule,
         r.reference_sha256 AS reference_sha256, r.gold_sha256 AS gold_sha256
  FROM runs r JOIN profiles p ON p.id = r.profile_id;
CREATE VIEW v_run_metrics AS
  SELECT m.run_id AS run_id, p.name AS profilo, r.created_at AS created_at, r.status AS status, r.judge_version AS judge_version,
         mn.name AS metrica, sn.name AS sottoinsieme, m.value AS value, m.low AS low, m.high AS high, m.n AS n
  FROM run_metrics m JOIN runs r ON r.id = m.run_id JOIN profiles p ON p.id = r.profile_id
       JOIN metric_names mn ON mn.id = m.metric_id JOIN subset_names sn ON sn.id = m.subset_id;
CREATE VIEW v_sample_top AS
  SELECT r.id AS run_id, p.name AS profilo, s.word AS secret, sm.block AS block, sm.has_gold AS has_gold,
         t.position AS position, w.word AS word, t.verified AS verified, t.variant AS variant,
         (SELECT h.verdict FROM human_verdicts h WHERE h.secret_id = t.secret_id AND h.word_id = t.word_id) AS human,
         (SELECT j.grade FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_grade,
         (SELECT j.sense_ok FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_sense_ok,
         (SELECT j.reason FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_reason
  FROM sample sm JOIN words s ON s.id = sm.secret_id
       JOIN run_top t ON t.secret_id = sm.secret_id JOIN runs r ON r.id = t.run_id AND r.status = 'completa'
       JOIN profiles p ON p.id = r.profile_id JOIN words w ON w.id = t.word_id
  WHERE t.position <= 11;
PRAGMA user_version = 1;

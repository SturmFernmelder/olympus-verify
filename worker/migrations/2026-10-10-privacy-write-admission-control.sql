-- Neutral transaction control only. Source-qualified trigger installation is a separate atomic operation.
-- Do not enable PRIVACY_WRITE_ADMISSION_ENABLED before exact current installation/readback qualification.
CREATE TABLE IF NOT EXISTS privacy_write_admission (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), protocol TEXT NOT NULL CHECK(protocol='olympus-write-admission-experiment-1'),
 active INTEGER NOT NULL CHECK(active IN(0,1)), nonce TEXT NOT NULL, purpose TEXT NOT NULL,
 entry_changes INTEGER NOT NULL CHECK(entry_changes>=0), logical_changes INTEGER NOT NULL CHECK(logical_changes>=0),
 CHECK((active=0 AND nonce='' AND purpose='') OR (active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')))
);
INSERT OR IGNORE INTO privacy_write_admission VALUES(1,'olympus-write-admission-experiment-1',0,'','',0,0);

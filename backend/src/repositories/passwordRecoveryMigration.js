export async function ensurePasswordRecovery(db){
 // Keep existing sessions valid at version zero until their account is reset.
 for(const table of ['users','refresh_tokens']){
  const [columns]=await db.query(`SHOW COLUMNS FROM ${table} LIKE 'auth_version'`)
  if(!columns.length)await db.query(`ALTER TABLE ${table} ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0`)
 }
 await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  credentials_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX(user_id,created_at)
 ) ENGINE=InnoDB`)
}

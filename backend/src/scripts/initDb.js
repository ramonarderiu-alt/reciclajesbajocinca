import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import { buildLineHash,buildLineIdentityHash } from '../services/deliveryNoteParser.js'

const connection = await mysql.createConnection({host:env.DB_HOST,port:env.DB_PORT,user:env.DB_USER,password:env.DB_PASSWORD,multipleStatements:true,charset:'utf8mb4'})
try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await connection.query(`USE \`${env.DB_NAME}\``)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (version INT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS companies (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trade_name VARCHAR(150) NOT NULL, legal_name VARCHAR(180), tax_id VARCHAR(30), address VARCHAR(255), phone VARCHAR(40), email VARCHAR(190), logo_url VARCHAR(500), primary_color CHAR(7) NOT NULL DEFAULT '#166534', timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid', language VARCHAR(10) NOT NULL DEFAULT 'ca', date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY', modules JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS roles (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE, description VARCHAR(255), is_system BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, permission_key VARCHAR(120) NOT NULL UNIQUE, module_key VARCHAR(80) NOT NULL, action_key ENUM('view','manage') NOT NULL, description VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS role_permissions (role_id BIGINT UNSIGNED NOT NULL, permission_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY(role_id,permission_id), FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE, FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, company_id BIGINT UNSIGNED NOT NULL, role_id BIGINT UNSIGNED NOT NULL, name VARCHAR(120) NOT NULL, username VARCHAR(80) NOT NULL UNIQUE, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, must_change_password BOOLEAN NOT NULL DEFAULT TRUE, time_clock_code VARCHAR(40) NULL UNIQUE, multi_time_clock_enabled BOOLEAN NOT NULL DEFAULT FALSE, time_clock_day_night_columns_enabled BOOLEAN NOT NULL DEFAULT FALSE, time_clock_management_enabled BOOLEAN NOT NULL DEFAULT FALSE, parent_user_id BIGINT UNSIGNED NULL, overtime_base_minutes INT NOT NULL DEFAULT 480, overtime_half_threshold_minutes INT NOT NULL DEFAULT 25, overtime_full_threshold_minutes INT NOT NULL DEFAULT 55, last_login_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(role_id) REFERENCES roles(id), FOREIGN KEY(parent_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id CHAR(36) PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, revoked_at DATETIME NULL, replaced_by CHAR(36) NULL, ip_address VARCHAR(45), user_agent VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX(user_id), INDEX(expires_at)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NULL, action VARCHAR(80) NOT NULL, entity VARCHAR(80) NOT NULL, record_id VARCHAR(80), old_values JSON, new_values JSON, ip_address VARCHAR(45), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL, INDEX(entity,record_id), INDEX(created_at)
    );
    CREATE TABLE IF NOT EXISTS sales_imports (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, company_id BIGINT UNSIGNED NOT NULL, imported_by BIGINT UNSIGNED NOT NULL, original_filename VARCHAR(255) NOT NULL, file_hash CHAR(64) NOT NULL, detected_company VARCHAR(190), page_count INT NOT NULL DEFAULT 0, client_count INT NOT NULL DEFAULT 0, row_count INT NOT NULL DEFAULT 0, confirmed_row_count INT NOT NULL DEFAULT 0, discarded_row_count INT NOT NULL DEFAULT 0, updated_row_count INT NOT NULL DEFAULT 0, taxable_base_total DECIMAL(16,2) NOT NULL DEFAULT 0, vat_total DECIMAL(16,2) NOT NULL DEFAULT 0, total_amount DECIMAL(16,2) NOT NULL DEFAULT 0, status ENUM('processing','pending_review','completed','failed','cancelled') NOT NULL, warnings JSON, errors JSON, confirmed_at DATETIME NULL, cancelled_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(imported_by) REFERENCES users(id), UNIQUE(company_id,file_hash), INDEX(status,created_at)
    );
    CREATE TABLE IF NOT EXISTS sales_import_clients (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NOT NULL, client_code VARCHAR(40) NOT NULL, client_name VARCHAR(190) NOT NULL, detected_subtotal JSON, UNIQUE(import_id,client_code), FOREIGN KEY(import_id) REFERENCES sales_imports(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sales_import_rows (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NOT NULL, import_client_id BIGINT UNSIGNED NULL, client_code VARCHAR(40), client_name VARCHAR(190), delivery_note_number VARCHAR(80) NOT NULL, delivery_date DATE NULL, external_code VARCHAR(80), product_code VARCHAR(80), concept TEXT, waste_code VARCHAR(20), vehicle_plate VARCHAR(30), vehicle_plate_normalized VARCHAR(30), trailer_plate VARCHAR(30), trailer_plate_normalized VARCHAR(30), quantity DECIMAL(18,4), unit_price DECIMAL(18,4), taxable_base DECIMAL(16,2), vat_amount DECIMAL(16,2), total_amount DECIMAL(16,2), source_page INT NOT NULL, raw_text TEXT, confidence ENUM('high','review','manual') NOT NULL DEFAULT 'high', warnings JSON, line_hash CHAR(64) NOT NULL, identity_hash CHAR(64) NULL, is_confirmed BOOLEAN NOT NULL DEFAULT FALSE, discarded_reason VARCHAR(40) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY(import_id) REFERENCES sales_imports(id) ON DELETE CASCADE, FOREIGN KEY(import_client_id) REFERENCES sales_import_clients(id) ON DELETE SET NULL, UNIQUE(import_id,line_hash), INDEX(client_code,delivery_date), INDEX(product_code), INDEX(delivery_note_number), INDEX(line_hash,is_confirmed), INDEX(identity_hash,is_confirmed)
    );
    CREATE TABLE IF NOT EXISTS sales_import_issues (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, import_id BIGINT UNSIGNED NOT NULL, row_id BIGINT UNSIGNED NULL, severity ENUM('warning','error') NOT NULL DEFAULT 'warning', issue_code VARCHAR(80) NOT NULL, message VARCHAR(500) NOT NULL, resolved_at DATETIME NULL, resolved_by BIGINT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(import_id) REFERENCES sales_imports(id) ON DELETE CASCADE, FOREIGN KEY(row_id) REFERENCES sales_import_rows(id) ON DELETE CASCADE, FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL, INDEX(import_id,severity)
    );
    CREATE TABLE IF NOT EXISTS sales_article_compost_group (
      company_id BIGINT UNSIGNED NOT NULL, product_code VARCHAR(80) NOT NULL, product_name VARCHAR(255) NOT NULL, is_compost BOOLEAN NOT NULL DEFAULT FALSE, manually_reviewed BOOLEAN NOT NULL DEFAULT FALSE, updated_by BIGINT UNSIGNED NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY(company_id,product_code,product_name), FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL, INDEX(is_compost,product_name)
    );
    CREATE TABLE IF NOT EXISTS time_clock_entries (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,work_date DATE NOT NULL,entry_type ENUM('in','out') NOT NULL,shift_type ENUM('day','night') NOT NULL,punched_at DATETIME(3) NOT NULL,ip_address VARCHAR(45),location_lat DECIMAL(10,7),location_lng DECIMAL(10,7),location_accuracy_meters DECIMAL(10,2),source ENUM('web','mobile','manual') NOT NULL,actor_user_id BIGINT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(actor_user_id) REFERENCES users(id),INDEX(user_id,punched_at),INDEX(actor_user_id,punched_at),INDEX(work_date)
    );
    CREATE TABLE IF NOT EXISTS time_clock_entry_edits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,entry_id BIGINT UNSIGNED NOT NULL,previous_punched_at DATETIME(3) NOT NULL,new_punched_at DATETIME(3) NOT NULL,edited_by_user_id BIGINT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(entry_id) REFERENCES time_clock_entries(id),FOREIGN KEY(edited_by_user_id) REFERENCES users(id),INDEX(entry_id)
    );
    CREATE TABLE IF NOT EXISTS time_clock_adjusted_exits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,first_entry_id BIGINT UNSIGNED NOT NULL,last_entry_id BIGINT UNSIGNED NOT NULL,adjusted_punched_at DATETIME(3) NOT NULL,offset_minutes INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE(first_entry_id),FOREIGN KEY(first_entry_id) REFERENCES time_clock_entries(id) ON DELETE CASCADE,FOREIGN KEY(last_entry_id) REFERENCES time_clock_entries(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS time_clock_absences (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,absence_type ENUM('vacation','sick_leave') NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,reason VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),INDEX(user_id,start_date,end_date)
    );
    CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(120) PRIMARY KEY,setting_value VARCHAR(255) NOT NULL,updated_by BIGINT UNSIGNED NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL);
  `)
  const [importColumns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='sales_imports'",[env.DB_NAME]);const importColumnSet=new Set(importColumns.map(row=>row.COLUMN_NAME));if(!importColumnSet.has('confirmed_row_count'))await connection.query('ALTER TABLE sales_imports ADD COLUMN confirmed_row_count INT NOT NULL DEFAULT 0 AFTER row_count');if(!importColumnSet.has('discarded_row_count'))await connection.query('ALTER TABLE sales_imports ADD COLUMN discarded_row_count INT NOT NULL DEFAULT 0 AFTER confirmed_row_count')
  if(!importColumnSet.has('updated_row_count'))await connection.query('ALTER TABLE sales_imports ADD COLUMN updated_row_count INT NOT NULL DEFAULT 0 AFTER discarded_row_count')
  const [rowColumns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='sales_import_rows'",[env.DB_NAME]);if(!rowColumns.some(row=>row.COLUMN_NAME==='discarded_reason'))await connection.query('ALTER TABLE sales_import_rows ADD COLUMN discarded_reason VARCHAR(40) NULL AFTER is_confirmed')
  const [classificationColumns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='sales_article_compost_group'",[env.DB_NAME])
  if(!classificationColumns.some(row=>row.COLUMN_NAME==='category')){
    await connection.query("ALTER TABLE sales_article_compost_group ADD COLUMN category ENUM('compost','excrements','fangs','teixits','cendres','altres') NULL AFTER product_name")
    await connection.query("UPDATE sales_article_compost_group SET category='compost' WHERE is_compost=TRUE AND manually_reviewed=TRUE")
  }
  const [classificationPrimaryKey]=await connection.query("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='sales_article_compost_group' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX",[env.DB_NAME])
  if(classificationPrimaryKey.length===2){
    await connection.query('ALTER TABLE sales_article_compost_group DROP PRIMARY KEY, ADD PRIMARY KEY(company_id,product_code,product_name)')
  }
  const [userColumns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users'",[env.DB_NAME])
  if(!userColumns.some(row=>row.COLUMN_NAME==='username'))await connection.query('ALTER TABLE users ADD COLUMN username VARCHAR(80) NULL AFTER name')
  await connection.query("UPDATE users SET username=CONCAT('usuari',id) WHERE username IS NULL OR username=''")
  const [usernameIndexes]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='username' AND NON_UNIQUE=0",[env.DB_NAME])
  if(!usernameIndexes.length)await connection.query('ALTER TABLE users ADD UNIQUE INDEX users_username_unique(username)')
  await connection.query('ALTER TABLE users MODIFY username VARCHAR(80) NOT NULL')
  const refreshedUserColumns=new Set((await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users'",[env.DB_NAME]))[0].map(row=>row.COLUMN_NAME))
  const timeClockUserColumns=[['time_clock_code','VARCHAR(40) NULL UNIQUE'],['multi_time_clock_enabled','BOOLEAN NOT NULL DEFAULT FALSE'],['time_clock_day_night_columns_enabled','BOOLEAN NOT NULL DEFAULT FALSE'],['time_clock_management_enabled','BOOLEAN NOT NULL DEFAULT FALSE'],['parent_user_id','BIGINT UNSIGNED NULL'],['overtime_base_minutes','INT NOT NULL DEFAULT 480'],['overtime_half_threshold_minutes','INT NOT NULL DEFAULT 25'],['overtime_full_threshold_minutes','INT NOT NULL DEFAULT 55']]
  for(const [column,definition] of timeClockUserColumns)if(!refreshedUserColumns.has(column))await connection.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`)
  await connection.execute(`INSERT INTO companies (id,trade_name,legal_name) VALUES (1,'Reciclajes Bajo Cinca','Reciclajes Bajo Cinca') ON DUPLICATE KEY UPDATE id=id`)
  for (const [name,description,system] of [['Administrador','Accés complet',1],['Supervisor','Supervisió i consulta',1],['Usuari','Accés bàsic',1]]) await connection.execute('INSERT INTO roles(name,description,is_system) VALUES(?,?,?) ON DUPLICATE KEY UPDATE description=VALUES(description)',[name,description,system])
  const permissions=[['dashboard.view','dashboard','view'],['users.view','users','view'],['users.manage','users','manage'],['roles.view','roles','view'],['roles.manage','roles','manage'],['company.view','company','view'],['company.manage','company','manage'],['audit.view','audit','view'],['sales_clients.view','sales_clients','view'],['sales_clients.manage','sales_clients','manage'],['time_clock.view','time_clock','view'],['time_clock.manage','time_clock','manage']]
  for(const [key,module,action] of permissions) await connection.execute('INSERT INTO permissions(permission_key,module_key,action_key) VALUES(?,?,?) ON DUPLICATE KEY UPDATE module_key=VALUES(module_key),action_key=VALUES(action_key)',[key,module,action])
  await connection.query(`INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='Administrador'`)
  await connection.query(`INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key IN ('dashboard.view','users.view','users.manage','roles.view','company.view') WHERE r.name='Supervisor'`)
  await connection.query(`INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='dashboard.view' WHERE r.name='Usuari'`)
  await connection.query(`INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE p.permission_key='time_clock.view'`)
  await connection.query(`INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_key='time_clock.manage' WHERE r.name='Supervisor'`)
  const [[adminRole]]=await connection.query("SELECT id FROM roles WHERE name='Administrador'")
  const hash=await bcrypt.hash(env.ADMIN_PASSWORD,12)
  await connection.execute('INSERT INTO users(company_id,role_id,name,username,email,password_hash,must_change_password) VALUES(1,?,?,?,?,?,TRUE) ON DUPLICATE KEY UPDATE username=VALUES(username)',[adminRole.id,env.ADMIN_NAME,env.ADMIN_USERNAME,env.ADMIN_EMAIL.toLowerCase(),hash])
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(1)')
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(2)')
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(3)')
  const [[hashMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=4')
  if(!hashMigration){const [rows]=await connection.query(`SELECT r.id,c.trade_name companyName,r.client_code clientCode,r.delivery_note_number deliveryNoteNumber,DATE_FORMAT(r.delivery_date,'%Y-%m-%d') date,r.product_code productCode,r.concept,r.quantity,r.unit_price unitPrice,r.taxable_base taxableBase,r.vat_amount vatAmount,r.total_amount totalAmount FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id JOIN companies c ON c.id=i.company_id`);for(const row of rows)await connection.execute('UPDATE sales_import_rows SET line_hash=? WHERE id=?',[buildLineHash(row),row.id]);await connection.execute('INSERT INTO schema_versions(version) VALUES(4)')}
  const [[companyHashMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=5')
  if(!companyHashMigration){const [rows]=await connection.query(`SELECT r.id,CAST(i.company_id AS CHAR) companyName,r.client_code clientCode,r.delivery_note_number deliveryNoteNumber,DATE_FORMAT(r.delivery_date,'%Y-%m-%d') date,r.product_code productCode,r.concept,r.quantity,r.unit_price unitPrice,r.taxable_base taxableBase,r.vat_amount vatAmount,r.total_amount totalAmount FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id`);for(const row of rows)await connection.execute('UPDATE sales_import_rows SET line_hash=? WHERE id=?',[buildLineHash(row),row.id]);await connection.execute('INSERT INTO schema_versions(version) VALUES(5)')}
  const [[canonicalHashMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=6')
  if(!canonicalHashMigration){const [rows]=await connection.query(`SELECT r.id,CAST(i.company_id AS CHAR) companyName,r.client_code clientCode,r.delivery_note_number deliveryNoteNumber,DATE_FORMAT(r.delivery_date,'%Y-%m-%d') date,r.product_code productCode,r.concept,r.quantity,r.unit_price unitPrice,r.taxable_base taxableBase,r.vat_amount vatAmount,r.total_amount totalAmount FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id`);for(const row of rows)await connection.execute('UPDATE sales_import_rows SET line_hash=? WHERE id=?',[buildLineHash(row),row.id]);await connection.execute('INSERT INTO schema_versions(version) VALUES(6)')}
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(7)')
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(8)')
  const [[classificationMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=9')
  if(!classificationMigration){await connection.query("ALTER TABLE sales_article_compost_group MODIFY category ENUM('compost','excrements','fangs','teixits','cendres','altres','no_comptabilitzar') NULL");await connection.execute('INSERT INTO schema_versions(version) VALUES(9)')}
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(10)')
  await connection.execute("INSERT INTO app_settings(setting_key,setting_value) VALUES('time_clock.exit_display_mode','real') ON DUPLICATE KEY UPDATE setting_key=setting_key")
  await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(11)')
  const [[articleConceptMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=12')
  if(!articleConceptMigration){
    await connection.query(`INSERT IGNORE INTO sales_article_compost_group(company_id,product_code,product_name,is_compost,category)
      SELECT i.company_id,r.product_code,LEFT(TRIM(r.concept),255),FALSE,NULL
      FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id
      WHERE r.is_confirmed=TRUE AND r.product_code IS NOT NULL AND TRIM(COALESCE(r.concept,''))<>''
      GROUP BY i.company_id,r.product_code,LEFT(TRIM(r.concept),255)`)
    await connection.query(`UPDATE sales_article_compost_group target
      JOIN (
        SELECT company_id,product_code,MAX(category) category
        FROM sales_article_compost_group
        WHERE manually_reviewed=TRUE AND category IS NOT NULL
        GROUP BY company_id,product_code
        HAVING COUNT(DISTINCT category)=1
      ) legacy ON legacy.company_id=target.company_id AND legacy.product_code=target.product_code
      SET target.category=legacy.category,target.is_compost=(legacy.category='compost')
      WHERE target.manually_reviewed=FALSE AND target.category IS NULL`)
    await connection.execute('INSERT INTO schema_versions(version) VALUES(12)')
  }
  const [[lineIdentityMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=13')
  if(!lineIdentityMigration){
    const [identityColumns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='sales_import_rows' AND COLUMN_NAME='identity_hash'",[env.DB_NAME])
    if(!identityColumns.length)await connection.query('ALTER TABLE sales_import_rows ADD COLUMN identity_hash CHAR(64) NULL AFTER line_hash, ADD INDEX sales_rows_identity_confirmed(identity_hash,is_confirmed)')
    const [rows]=await connection.query("SELECT r.id,CAST(i.company_id AS CHAR) companyName,r.client_code clientCode,r.delivery_note_number deliveryNoteNumber,DATE_FORMAT(r.delivery_date,'%Y-%m-%d') date,r.product_code productCode,r.concept,r.quantity FROM sales_import_rows r JOIN sales_imports i ON i.id=r.import_id WHERE r.identity_hash IS NULL")
    for(const row of rows)await connection.execute('UPDATE sales_import_rows SET identity_hash=? WHERE id=?',[buildLineIdentityHash(row),row.id])
    await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(13)')
  }
  const [[priceReconciliationMigration]]=await connection.query('SELECT version FROM schema_versions WHERE version=14')
  if(!priceReconciliationMigration){
    const [matches]=await connection.query(`SELECT identity_hash,MIN(id) canonical_id,MAX(CASE WHEN COALESCE(unit_price,0)<>0 THEN id END) priced_id FROM sales_import_rows WHERE is_confirmed=TRUE AND identity_hash IS NOT NULL GROUP BY identity_hash HAVING SUM(COALESCE(unit_price,0)=0)>0 AND SUM(COALESCE(unit_price,0)<>0)>0`)
    for(const match of matches){
      const [[priced]]=await connection.query('SELECT unit_price,taxable_base,vat_amount,total_amount FROM sales_import_rows WHERE id=?',[match.priced_id])
      await connection.execute('UPDATE sales_import_rows SET unit_price=?,taxable_base=?,vat_amount=?,total_amount=? WHERE id=?',[priced.unit_price,priced.taxable_base,priced.vat_amount,priced.total_amount,match.canonical_id])
      await connection.execute("UPDATE sales_import_rows SET is_confirmed=FALSE,discarded_reason='updated_existing' WHERE identity_hash=? AND is_confirmed=TRUE AND id<>?",[match.identity_hash,match.canonical_id])
    }
    await connection.query(`UPDATE sales_imports i LEFT JOIN (SELECT import_id,SUM(is_confirmed=TRUE) confirmed_count,SUM(discarded_reason='duplicate') duplicate_count,SUM(discarded_reason='updated_existing') updated_count FROM sales_import_rows GROUP BY import_id) counts ON counts.import_id=i.id SET i.confirmed_row_count=COALESCE(counts.confirmed_count,0),i.discarded_row_count=COALESCE(counts.duplicate_count,0),i.updated_row_count=COALESCE(counts.updated_count,0) WHERE i.status='completed'`)
    await connection.execute('INSERT IGNORE INTO schema_versions(version) VALUES(14)')
  }
  console.log('Esquema inicialitzat correctament (versió 14).')
} finally { await connection.end() }

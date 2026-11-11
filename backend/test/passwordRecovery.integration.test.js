import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import bcrypt from 'bcryptjs'
import {pool} from '../src/config/db.js'
import {ensurePasswordRecovery} from '../src/repositories/passwordRecoveryMigration.js'
import {requestPasswordRecovery,resetPassword} from '../src/services/passwordRecoveryService.js'

// Opt in explicitly. All mutations use isolated, randomly prefixed fixture tables.
test('recuperació de contrasenyes amb transaccions MySQL',{skip:process.env.TEST_PASSWORD_RECOVERY_DB!=='true'},async t=>{
 const connection=await pool.getConnection(),prefix=`test_recovery_${randomBytes(6).toString('hex')}_`
 const tables=['users','refresh_tokens','audit_logs','password_reset_tokens']
 const rewrite=sql=>sql.replace(/\b(users|refresh_tokens|audit_logs|password_reset_tokens)\b/g,name=>prefix+name)
 const execute=(sql,params)=>connection.execute(rewrite(sql),params)
 const db={query:(sql,params)=>connection.query(rewrite(sql),params),execute,getConnection:async()=>{
  const c=await pool.getConnection()
  return {execute:(sql,params)=>c.execute(rewrite(sql),params),beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release()}
 }}
 const config={NODE_ENV:'production',APP_PUBLIC_URL:'https://programa.example.test',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'test-only',MAIL_FROM:'sender@example.test',PASSWORD_RECOVERY_TO:'recovery@example.test'}
 const messages=[],sendEmail=async message=>{messages.push(message)}
 const options={db,config,sendEmail},meta={ip:'127.0.0.1'}
 const tokenFrom=message=>new URLSearchParams(new URL(message.text.split('\n').find(line=>/^https?:\/\//.test(line))).hash.slice(1)).get('token')
 const hash=value=>createHash('sha256').update(value).digest('hex')
 const originalPassword='original-contrasenya',originalHash=await bcrypt.hash(originalPassword,4)
 let nextId=1
 const addUser=async(username,fields={})=>{
  const id=nextId++
  await execute('INSERT INTO users(id,username,name,password_hash,is_active,deleted_at) VALUES(?,?,?,?,?,?)',[id,username,fields.name||username,originalHash,fields.active===false?0:1,fields.deleted?new Date():null])
  return id
 }
 try{
  await db.query('CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY,username VARCHAR(80) NOT NULL UNIQUE,name VARCHAR(120) NOT NULL,password_hash VARCHAR(255) NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE,deleted_at DATETIME NULL,must_change_password BOOLEAN NOT NULL DEFAULT TRUE) ENGINE=InnoDB')
  await db.query('CREATE TABLE refresh_tokens (id CHAR(36) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,revoked_at DATETIME NULL) ENGINE=InnoDB')
  await db.query('CREATE TABLE audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,action VARCHAR(80),entity VARCHAR(80),record_id VARCHAR(80),new_values JSON,ip_address VARCHAR(45)) ENGINE=InnoDB')
  await ensurePasswordRecovery(db)

  await t.test('la migració és repetible i conserva les dades i la versió zero',async()=>{
   await addUser('preexistent')
   await ensurePasswordRecovery(db)
   const [[user]]=await execute('SELECT username,auth_version FROM users WHERE id=1')
   assert.deepEqual(user,{username:'preexistent',auth_version:0})
  })

  await t.test('genera enllaços temporals també per a administradors i desa només hashes',async()=>{
   for(const username of ['administrador','supervisor','usuari']){
    const id=await addUser(username)
    assert.equal(await requestPasswordRecovery(username,meta,options),undefined)
    const message=messages.at(-1),token=tokenFrom(message)
    assert.match(message.text,new RegExp(`Usuari: ${username}`))
    assert.match(token,/^[A-Za-z0-9_-]{43}$/)
    const [[stored]]=await execute('SELECT token_hash,credentials_hash,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),expires_at) seconds_left FROM password_reset_tokens WHERE user_id=?',[id])
    assert.equal(stored.token_hash,hash(token));assert.equal(stored.credentials_hash,hash(originalHash))
    assert.ok(stored.seconds_left>=1790&&stored.seconds_left<=1801)
    assert.ok(!JSON.stringify(stored).includes(token))
   }
  })

  await t.test('genera un enllaç de localhost i permet restablir el compte local',async()=>{
   const id=await addUser('local-user')
   await requestPasswordRecovery('local-user',meta,{...options,config:{...config,NODE_ENV:'development',APP_PUBLIC_URL:'http://localhost:5174'}})
   const message=messages.at(-1),token=tokenFrom(message)
   const url=new URL(message.text.split('\n').find(line=>line.startsWith('http://')))
   assert.equal(url.origin,'http://localhost:5174')
   assert.equal(url.pathname,'/reset-password')
   assert.equal(url.search,'')
   assert.match(token,/^[A-Za-z0-9_-]{43}$/)
   await resetPassword({token,password:'nova-contrasenya-local'},meta,{db})
   const [[user]]=await execute('SELECT password_hash,auth_version FROM users WHERE id=?',[id])
   assert.equal(await bcrypt.compare('nova-contrasenya-local',user.password_hash),true)
   assert.equal(user.auth_version,1)
  })

  await t.test('ignora noms inexistents i comptes inactius o eliminats i limita les repeticions per compte',async()=>{
   await addUser('inactiu',{active:false});await addUser('eliminat',{deleted:true})
   const before=messages.length
   for(const username of ['inexistent','inactiu','eliminat','ADMINISTRADOR'])await requestPasswordRecovery(username,meta,options)
   assert.equal(messages.length,before)
   const [[user]]=await execute("SELECT password_hash FROM users WHERE username='administrador'")
   assert.equal(user.password_hash,originalHash)
  })

  await t.test('canvia només el compte sol·licitat, consumeix tots els seus enllaços i revoca les seves sessions',async()=>{
   const message=messages.find(message=>message.text.includes('Usuari: usuari\n')),token=tokenFrom(message)
   const [[{id}]]=await execute("SELECT id FROM users WHERE username='usuari'")
   await execute('INSERT INTO refresh_tokens(id,user_id) VALUES(?,?),(?,?)',['one',id,'two',id])
   await execute('INSERT INTO password_reset_tokens(user_id,token_hash,credentials_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))',[id,hash('another'),hash(originalHash)])
   await resetPassword({token,password:'nova-contrasenya'},meta,{db})
   const [[user]]=await execute('SELECT password_hash,must_change_password,auth_version FROM users WHERE id=?',[id])
   assert.equal(await bcrypt.compare('nova-contrasenya',user.password_hash),true)
   assert.equal(user.must_change_password,0);assert.equal(user.auth_version,1)
   const [[counts]]=await execute('SELECT COUNT(*) total,SUM(used_at IS NOT NULL) used FROM password_reset_tokens WHERE user_id=?',[id])
   assert.equal(Number(counts.used),counts.total)
   const [sessions]=await execute('SELECT revoked_at FROM refresh_tokens WHERE user_id=?',[id])
   assert.ok(sessions.every(session=>session.revoked_at))
   await assert.rejects(()=>resetPassword({token,password:'encara-una-altra'},meta,{db}),error=>error.code==='INVALID_RESET_TOKEN')
   const [audits]=await execute('SELECT new_values FROM audit_logs')
   assert.ok(!JSON.stringify(audits).includes(token));assert.ok(!JSON.stringify(audits).includes('nova-contrasenya'))
   const [[other]]=await execute("SELECT password_hash FROM users WHERE username='administrador'")
   assert.equal(other.password_hash,originalHash)
  })

  await t.test('refusa enllaços caducats, contrasenyes canviades i comptes desactivats després de la petició',async()=>{
   for(const kind of ['expired','changed','inactive','deleted']){
    const id=await addUser(kind)
    await requestPasswordRecovery(kind,meta,options)
    const token=tokenFrom(messages.at(-1))
    if(kind==='expired')await execute('UPDATE password_reset_tokens SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?',[id])
    if(kind==='changed')await execute('UPDATE users SET password_hash=? WHERE id=?',['different-hash',id])
    if(kind==='inactive')await execute('UPDATE users SET is_active=FALSE WHERE id=?',[id])
    if(kind==='deleted')await execute('UPDATE users SET deleted_at=NOW() WHERE id=?',[id])
    await assert.rejects(()=>resetPassword({token,password:'nova-contrasenya'},meta,{db}),error=>error.code==='INVALID_RESET_TOKEN')
    const [[user]]=await execute('SELECT auth_version FROM users WHERE id=?',[id]);assert.equal(user.auth_version,0)
   }
  })

  await t.test('un error SMTP elimina el token i conserva la contrasenya',async()=>{
   const id=await addUser('smtp-failed')
   await assert.rejects(()=>requestPasswordRecovery('smtp-failed',meta,{...options,sendEmail:async()=>{throw Error('SMTP failed')}}),/SMTP failed/)
   const [[{total}]]=await execute('SELECT COUNT(*) total FROM password_reset_tokens WHERE user_id=?',[id]);assert.equal(total,0)
   const [[user]]=await execute('SELECT password_hash FROM users WHERE id=?',[id]);assert.equal(user.password_hash,originalHash)
  })

  await t.test('un error d’auditoria reverteix el canvi, el consum del token i la revocació de sessions',async()=>{
   const id=await addUser('rollback')
   await execute('INSERT INTO refresh_tokens(id,user_id) VALUES(?,?)',['rollback-session',id])
   await requestPasswordRecovery('rollback',meta,options)
   const token=tokenFrom(messages.at(-1))
   const failingDb={getConnection:async()=>{
    const c=await db.getConnection()
    return {...c,execute:(sql,params)=>{if(sql.startsWith('INSERT INTO audit_logs'))throw Error('Audit failed');return c.execute(sql,params)}}
   }}
   await assert.rejects(()=>resetPassword({token,password:'nova-contrasenya'},meta,{db:failingDb}),/Audit failed/)
   const [[user]]=await execute('SELECT password_hash,auth_version FROM users WHERE id=?',[id]);assert.equal(user.password_hash,originalHash);assert.equal(user.auth_version,0)
   const [[reset]]=await execute('SELECT used_at FROM password_reset_tokens WHERE user_id=?',[id]);assert.equal(reset.used_at,null)
   const [[session]]=await execute('SELECT revoked_at FROM refresh_tokens WHERE user_id=?',[id]);assert.equal(session.revoked_at,null)
  })

  await t.test('dues peticions concurrents només envien un correu i un token només es pot consumir una vegada',async()=>{
   await addUser('concurrent')
   const before=messages.length
   await Promise.all([requestPasswordRecovery('concurrent',meta,options),requestPasswordRecovery('concurrent',meta,options)])
   assert.equal(messages.length,before+1)
   const token=tokenFrom(messages.at(-1))
   const results=await Promise.allSettled([resetPassword({token,password:'nova-contrasenya'},meta,{db}),resetPassword({token,password:'una-altra-contrasenya'},meta,{db})])
   assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
   assert.equal(results.find(result=>result.status==='rejected').reason.code,'INVALID_RESET_TOKEN')
  })
 }finally{
  for(const table of tables.toReversed())await connection.query(`DROP TABLE IF EXISTS ${prefix}${table}`)
  connection.release();await pool.end()
 }
})

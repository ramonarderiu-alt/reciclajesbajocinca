const WEB_USER = Object.freeze({
  name: 'RA',
  username: 'ra',
  email: 'ra@reciclajesbajocinca.es',
  passwordHash: '$2b$12$b4zaREYYqJiUqI1KHd.4heZHloj63xH5zIaT2evaMyjubtVfC3jvm',
  roleName: 'Usuari'
})

export async function ensureWebUser(db) {
  const [[role]] = await db.execute('SELECT id FROM roles WHERE name=?', [WEB_USER.roleName])
  if (!role) throw new Error(`No existeix el rol ${WEB_USER.roleName} per crear l'usuari web`)

  try {
    await db.execute(
      'INSERT INTO users(company_id,role_id,name,username,email,password_hash,is_active,must_change_password) VALUES(1,?,?,?,?,?,TRUE,TRUE)',
      [role.id, WEB_USER.name, WEB_USER.username, WEB_USER.email, WEB_USER.passwordHash]
    )
    return true
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return false
    throw error
  }
}

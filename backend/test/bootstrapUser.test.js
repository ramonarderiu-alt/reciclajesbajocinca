import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { ensureWebUser } from '../src/services/bootstrapUserService.js'

test('crea el compte web amb el rol basic i la contrasenya indicada', async () => {
  const calls = []
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params })
      if (sql.startsWith('SELECT id FROM roles')) return [[{ id: 7 }]]
      return [{ insertId: 12 }]
    }
  }

  assert.equal(await ensureWebUser(db), true)
  assert.deepEqual(calls[0].params, ['Usuari'])
  assert.deepEqual(calls[1].params.slice(0, 4), [7, 'RA', 'ra', 'ra@reciclajesbajocinca.es'])
  assert.equal(await bcrypt.compare('3', calls[1].params[4]), true)
})

test('no modifica el compte web si ja existeix', async () => {
  const duplicate = Object.assign(new Error('duplicat'), { code: 'ER_DUP_ENTRY' })
  const db = {
    execute: async sql => {
      if (sql.startsWith('SELECT id FROM roles')) return [[{ id: 7 }]]
      throw duplicate
    }
  }

  assert.equal(await ensureWebUser(db), false)
})

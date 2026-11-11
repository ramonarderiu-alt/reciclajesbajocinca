import test from 'node:test'
import assert from 'node:assert/strict'
import {safeLoginRedirect} from '../../frontend/src/services/loginRedirect.js'

test('conserva l’apartat i els filtres de vendes després d’iniciar sessió',()=>{
 const link='/sales-clients?tab=sales&from=2025-01-01&to=2025-12-31&article=Paper'
 assert.equal(safeLoginRedirect(link),link)
})

test('el retorn d’inici de sessió només accepta rutes internes, sense bucles ni redireccions externes',()=>{
 for(const value of [undefined,[],['/sales-clients'],'https://other.test','//other.test','/\\other.test','/\n/other.test','/login','/login?redirect=/login'])assert.equal(safeLoginRedirect(value),'/')
 assert.equal(safeLoginRedirect('/time-clock'),'/time-clock')
})

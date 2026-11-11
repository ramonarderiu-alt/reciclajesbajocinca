import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {loadEnvFile} from '../src/config/envFile.js'

function fixture(t){
 const temporaryRoot=fs.realpathSync(os.tmpdir())
 const directory=fs.mkdtempSync(path.join(temporaryRoot,'rbc-env-'))
 t.after(()=>{
  const target=fs.realpathSync(directory)
  assert.equal(path.dirname(target).toLowerCase(),temporaryRoot.toLowerCase())
  assert.match(path.basename(target),/^rbc-env-/)
  fs.rmSync(target,{recursive:true,force:true})
 })
 const backend=path.join(directory,'backend')
 fs.mkdirSync(backend)
 const defaultPath=path.join(backend,'.env')
 fs.writeFileSync(defaultPath,'APP_PUBLIC_URL=http://localhost:5174\nSMTP_PASSWORD=fixture-secret\n')
 fs.writeFileSync(path.join(directory,'.env'),'APP_PUBLIC_URL=https://wrong.example.test\n')
 return {directory,backend,defaultPath}
}

test('configuració: el fitxer del backend no depèn del directori de treball',t=>{
 const {directory,backend,defaultPath}=fixture(t)
 for(const cwd of [directory,backend]){
  const environment={}
  const source=loadEnvFile({environment,cwd,defaultPath})
  assert.equal(source.envFile,defaultPath)
  assert.equal(source.fileLoaded,true)
  assert.equal(environment.APP_PUBLIC_URL,'http://localhost:5174')
  assert.equal(environment.SMTP_PASSWORD,'fixture-secret')
  assert.ok(!JSON.stringify(source).includes('fixture-secret'))
 }
})

test('configuració: permet seleccionar un altre fitxer amb RBC_ENV_FILE',t=>{
 const {directory,backend,defaultPath}=fixture(t)
 const file=path.join(directory,'.env')
 for(const [RBC_ENV_FILE,cwd] of [[file,backend],['.env',directory]]){
  const environment={RBC_ENV_FILE}
  const source=loadEnvFile({environment,cwd,defaultPath})
  assert.equal(source.envFile,file)
  assert.equal(environment.APP_PUBLIC_URL,'https://wrong.example.test')
  assert.equal(environment.SMTP_PASSWORD,undefined)
 }
})

test('configuració: identifica les variables heretades sense mostrar-ne els valors',t=>{
 const {directory,defaultPath}=fixture(t)
 const environment={SMTP_PASSWORD:'inherited-secret',APP_PUBLIC_URL:'http://localhost:5174'}
 const source=loadEnvFile({environment,cwd:directory,defaultPath})
 assert.equal(environment.SMTP_PASSWORD,'inherited-secret')
 assert.deepEqual(source.overriddenKeys,['SMTP_PASSWORD'])
 assert.ok(!JSON.stringify(source).includes('inherited-secret'))
 assert.ok(!JSON.stringify(source).includes('fixture-secret'))
})

test('configuració: un fitxer explícit inexistent falla en lloc de carregar-ne un altre',t=>{
 const {directory,defaultPath}=fixture(t)
 assert.throws(()=>loadEnvFile({environment:{RBC_ENV_FILE:'missing.env'},cwd:directory,defaultPath}),/No es pot llegir el fitxer/)
 const environment={APP_PUBLIC_URL:'https://inherited.example.test'}
 const source=loadEnvFile({environment,defaultPath:path.join(directory,'missing.env')})
 assert.equal(source.fileLoaded,false)
 assert.equal(environment.APP_PUBLIC_URL,'https://inherited.example.test')
})

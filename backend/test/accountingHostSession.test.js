import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const source=readFileSync(new URL('../../modules/accounting/frontend/src/host-session.js',import.meta.url),'utf8')
const location={href:'https://app.example.test/accounting-app/index.html',origin:'https://app.example.test'}

function fixture(fetch){
 let token='tab-token'
 const listeners=new Map(),parent={postMessage(message,origin){
  assert.equal(origin,location.origin)
  token='renewed-token'
  queueMicrotask(()=>listeners.get('message')?.({origin,source:parent,data:{type:'accounting:session',requestId:message.requestId,success:true}}))
 }}
 const window={fetch,parent,addEventListener(type,listener){listeners.set(type,listener)},removeEventListener(type){listeners.delete(type)}}
 vm.runInNewContext(source,{window,location,sessionStorage:{getItem:key=>key==='accessToken'?token:null},URL,Request,Headers,crypto,setTimeout,clearTimeout})
 return window.fetch
}

test('informes: conserva accounting/ del domini dins del prefix de l’API integrada',async()=>{
 const requests=[],fetch=fixture(async request=>{requests.push(request);return new Response('{}')})
 for(const report of ['balance-sheet','profit-loss','trial-balance','ledger','review']){
  await fetch(`/api/accounting/${report}?exercise_id=7&date=2026-12-31&compare_previous=true`)
  const request=requests.at(-1),url=new URL(request.url)
  assert.equal(url.pathname,`/api/accounting/accounting/${report}`)
  assert.equal(url.search,'?exercise_id=7&date=2026-12-31&compare_previous=true')
  assert.equal(request.headers.get('authorization'),'Bearer tab-token')
 }
 for(const path of ['context','companies','accounts','entries','access/session']){
  await fetch('/api/'+path)
  assert.equal(new URL(requests.at(-1).url).pathname,'/api/accounting/'+path)
 }
})

test('pont de sessió: conserva mètode, cos i capçaleres d’un Request',async()=>{
 let sent
 const fetch=fixture(async request=>{sent=request;return new Response('{}')})
 const request=new Request(location.origin+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':'7'},body:JSON.stringify({description:'entry'}),credentials:'include'})
 await fetch(request)
 assert.equal(sent.url,location.origin+'/api/accounting/entries')
 assert.equal(sent.method,'POST')
 assert.equal(sent.credentials,'include')
 assert.equal(sent.headers.get('X-Company-Id'),'7')
 assert.deepEqual(await sent.json(),{description:'entry'})
})

test('pont de sessió: no modifica recursos estàtics ni envia tokens a altres orígens',async()=>{
 const calls=[],fetch=fixture(async(...args)=>{calls.push(args);return new Response('')})
 for(const input of ['/assets/app.js','https://other.example.test/api/accounting/balance-sheet']){
  const options={headers:{'X-Test':'original'}}
  await fetch(input,options)
  assert.equal(calls.at(-1)[0],input)
  assert.equal(calls.at(-1)[1],options)
  assert.equal(options.headers.Authorization,undefined)
 }
})

test('pont de sessió: reintenta l’informe després de renovar sense duplicar el prefix',async()=>{
 const requests=[],fetch=fixture(async request=>{
  requests.push(request)
  return new Response('{}',{status:requests.length===1?401:200})
 })
 const response=await fetch('/api/accounting/balance-sheet?exercise_id=7')
 assert.equal(response.status,200)
 assert.equal(requests.length,2)
 assert.equal(requests[0].url,location.origin+'/api/accounting/accounting/balance-sheet?exercise_id=7')
 assert.equal(requests[1].url,requests[0].url)
 assert.equal(requests[0].headers.get('authorization'),'Bearer tab-token')
 assert.equal(requests[1].headers.get('authorization'),'Bearer renewed-token')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import WebSocket from 'ws'
import {ScaleService,attachScaleAgent,serialOptions} from '../src/services/scaleService.js'
const token='test-only-device-credential-1234567890'
const device={id:'test-scale',companyId:1,simulation:true,tokenHash:createHash('sha256').update(token).digest('hex')}
const serial={path:'COM3',baudRate:9600,dataBits:8,parity:'none',stopBits:1,rtscts:false,xon:false,xoff:false}
const reading=()=>({type:'reading',weight:1250,unit:'kg',stable:null,valid:true,timestamp:new Date().toISOString(),ascii:'1250',hex:'31323530'})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(predicate,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await pause(100)}throw Error('Condition timed out')}
test('device authentication, tenancy, stale data, invalid messages and serial disconnect',()=>{
 let now=Date.now();const service=new ScaleService([device],{now:()=>now});const ws={}
 assert.equal(service.authenticate(device.id,'wrong'),null);assert.equal(service.authenticate(device.id,token),device)
 assert.equal(service.connect(device,ws),true);assert.equal(service.connect(device,{}),false)
 assert.equal(service.snapshot(device.id,2),null)
 service.receive(device.id,{type:'status',simulation:true,connected:true,error:null,serial});service.receive(device.id,reading())
 assert.equal(service.snapshot(device.id,1).reading.weight,1250)
 assert.equal(service.snapshot(device.id,1).frames,undefined)
 assert.throws(()=>service.receive(device.id,{...reading(),weight:'1250'}))
 assert.throws(()=>service.receive(device.id,{...reading(),timestamp:new Date(now-10000).toISOString()}))
 assert.throws(()=>service.receive(device.id,{type:'status',simulation:false,connected:true,error:null,serial}))
 now+=6000;assert.equal(service.snapshot(device.id,1).reading,null)
 now=Date.now();service.receive(device.id,reading());service.receive(device.id,{type:'status',simulation:true,connected:false,error:null,serial})
 assert.equal(service.snapshot(device.id,1).reading,null)
 assert.equal(service.snapshot(device.id,1).status,'disconnected')
 assert.ok(service.snapshot(device.id,1).lastTimestamp)
 service.disconnect(device.id,ws);assert.equal(service.snapshot(device.id,1).status,'disconnected')
 assert.throws(()=>serialOptions.parse({...serial,path:'../../file'}))
})
test('raw diagnostics work without a known framing or weight protocol',()=>{
 const service=new ScaleService([device]);service.connect(device,{})
 service.receive(device.id,{type:'status',simulation:true,connected:true,error:null,serial})
 service.receive(device.id,{type:'raw',ascii:'unknown',hex:'756e6b6e6f776e',timestamp:new Date().toISOString()})
 const snapshot=service.snapshot(device.id,1,true)
 assert.equal(snapshot.status,'receiving');assert.equal(snapshot.reading,null);assert.equal(snapshot.raw.ascii,'unknown')
 assert.equal(service.snapshot(device.id,1).raw,undefined)
})
test('real simulated agent, WSS handler authentication, duplicate identity, configuration ACK and network reconnect',{skip:!existsSync(new URL('../../scale-agent/node_modules/serialport/package.json',import.meta.url))?'Run npm ci --prefix scale-agent to enable the agent integration test':false},async t=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),dir=await mkdtemp(path.join(os.tmpdir(),'rbc-scale-'))
 const service=new ScaleService([device]);let server=createServer(),stop=attachScaleAgent(server,service)
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port,url=`ws://127.0.0.1:${port}/api/scale/agent`
 let child
 t.after(async()=>{child?.kill();if(child&&!child.exitCode)await Promise.race([once(child,'exit'),pause(2000)]);stop();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})})
 const bad=new WebSocket(url+'?id=test-scale',{headers:{Authorization:'Bearer wrong'}})
 const rejected=await new Promise(resolve=>{bad.on('unexpected-response',(_,res)=>{res.resume();bad.terminate();resolve(res.statusCode)});bad.on('error',()=>{})});assert.equal(rejected,401)
 const example=JSON.parse(await readFile(path.join(root,'scale-agent/config.example.json'),'utf8'))
 await writeFile(path.join(dir,'token.txt'),token);await writeFile(path.join(dir,'config.json'),JSON.stringify({...example,url,scaleId:device.id,tokenFile:'token.txt',simulation:true}))
 child=spawn(process.execPath,[path.join(root,'scale-agent/src/index.js')],{cwd:dir,env:{...process.env,SCALE_ALLOW_LOCAL_WS:'true',SCALE_CONFIG:path.join(dir,'config.json')},stdio:'pipe'})
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b)
 try{await until(()=>service.snapshot(device.id,1)?.reading)}catch(e){throw Error(e.message+' '+logs)}
 assert.equal(service.snapshot(device.id,1).simulation,true)
 const duplicate=new WebSocket(url+'?id=test-scale',{headers:{Authorization:`Bearer ${token}`}})
 const conflict=await new Promise(resolve=>{duplicate.on('unexpected-response',(_,res)=>{res.resume();duplicate.terminate();resolve(res.statusCode)});duplicate.on('error',()=>{})});assert.equal(conflict,409)
 assert.equal((await service.command(device.id,{type:'configure',serial})).ok,true)
 const persisted=JSON.parse(await readFile(path.join(dir,'config.json'),'utf8'));assert.equal(persisted.serial.path,'COM3')
 assert.equal((await service.command(device.id,{type:'configure',serial:{...serial,baudRate:0}})).ok,false)
 stop();await new Promise(r=>server.close(r));await until(()=>service.snapshot(device.id,1).status==='disconnected')
 assert.equal(service.snapshot(device.id,1).reading,null)
 server=createServer();stop=attachScaleAgent(server,service);server.listen(port,'127.0.0.1');await once(server,'listening')
 await until(()=>service.snapshot(device.id,1)?.reading)
 assert.ok(service.snapshot(device.id,1).reading.weight>0)
})

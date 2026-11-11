import {SerialPort} from 'serialport'
import WebSocket from 'ws'
import {readFile,writeFile,rename} from 'node:fs/promises'
import path from 'node:path'
import {createDecoder,serialSchema,protocolSchema} from './protocol.js'
import {z} from 'zod'

if(process.argv.includes('--ports')){console.log(JSON.stringify(await SerialPort.list(),null,2));process.exit(0)}
const configPath=path.resolve(process.env.SCALE_CONFIG||'config.json')
const schema=z.object({url:z.string().url(),scaleId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),tokenFile:z.string(),simulation:z.boolean(),serial:serialSchema,protocol:protocolSchema}).strict()
let config=schema.parse(JSON.parse(await readFile(configPath,'utf8')))
const url=new URL(config.url)
if(url.protocol!=='wss:'&&!(process.env.SCALE_ALLOW_LOCAL_WS==='true'&&url.protocol==='ws:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('WSS required')
url.searchParams.set('id',config.scaleId)
const token=(await readFile(path.resolve(path.dirname(configPath),config.tokenFile),'utf8')).trim()
if(token.length<32)throw Error('Device credential too short')
let socket,port,serialTimer,networkTimer,simulationTimer,watchdog,stopping=false,serialAttempt=0,networkAttempt=0,serialConnected=false,lastError=null,generation=0,actualPath=config.serial.path,commandBusy=false
const delay=n=>Math.min(30000,1000*2**Math.min(n,5))+Math.random()*500
function log(message){console.log(`${new Date().toISOString()} ${message}`)}
function send(data){if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<65536)socket.send(JSON.stringify(data))}
function status(){send({type:'status',simulation:config.simulation,connected:serialConnected,error:lastError,serial:{...config.serial,path:actualPath}})}
function serialRetry(){if(stopping||serialTimer)return;serialTimer=setTimeout(()=>{serialTimer=null;openSerial()},delay(serialAttempt++))}
function openSerial(){
 const current=++generation
 const decoder=createDecoder(config.protocol,frame=>send({type:'reading',...frame}))
 if(config.simulation){serialConnected=true;actualPath='SIMULATION';status();simulationTimer=setInterval(()=>{send({type:'reading',weight:1250+Math.round(Math.sin(Date.now()/5000)*5),unit:'kg',valid:true,stable:true,timestamp:new Date().toISOString(),ascii:'SIMULATION',hex:''})},1000);return}
 ;(async()=>{try{
  let selected=config.serial.path
  if(selected==='auto'){
   const candidates=(await SerialPort.list()).filter(p=>p.vendorId?.toLowerCase()==='067b'||/prolific/i.test(p.manufacturer||''))
   if(candidates.length!==1)throw Error('Select COM explicitly')
   selected=candidates[0].path
  }
  if(current!==generation||stopping)return
  actualPath=selected;const p=new SerialPort({...config.serial,path:selected,autoOpen:false});port=p
  let lastRaw=0
  p.on('data',chunk=>{if(current!==generation)return;if(Date.now()-lastRaw>250){lastRaw=Date.now();const raw=chunk.subarray(0,512);send({type:'raw',ascii:raw.toString('ascii'),hex:raw.toString('hex'),timestamp:new Date().toISOString()})}try{decoder(chunk)}catch{lastError='Frame buffer error';status()}})
  p.on('error',()=>{if(current!==generation)return;lastError='Serial communication error';serialConnected=false;status();if(p.isOpen)p.close();else serialRetry()})
  p.on('close',()=>{if(current!==generation)return;serialConnected=false;status();serialRetry()})
  p.open(error=>{if(current!==generation){if(!error&&p.isOpen)p.close();return}if(error){lastError='Cannot open COM port';serialConnected=false;status();serialRetry();return}serialAttempt=0;lastError=null;serialConnected=true;status();log('Serial connected')})
 }catch{if(current!==generation)return;lastError='COM detection failed: select one available Prolific port';serialConnected=false;status();serialRetry()}})()
}
async function resetSerial(){generation++;clearTimeout(serialTimer);serialTimer=null;clearInterval(simulationTimer);serialConnected=false;lastError=null;status();const previous=port;port=null;if(previous?.isOpen)await new Promise(resolve=>previous.close(()=>resolve()));openSerial()}
async function handleCommand(raw){
 let data;try{data=JSON.parse(raw)}catch{return}
 if(!z.string().uuid().safeParse(data.id).success)return
 if(commandBusy){send({type:'ack',id:data.id,ok:false});return}commandBusy=true
 try{
  if(data.type==='configure'){
   const serial=serialSchema.parse(data.serial),next={...config,serial};const temp=configPath+'.tmp'
   await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});await rename(temp,configPath);config=next;await resetSerial()
  }else if(data.type==='manual'){
   if(data.confirmed!==true||!['ascii','hex'].includes(data.encoding)||typeof data.data!=='string'||data.data.length>256||!data.data.length||config.simulation||!port?.isOpen)throw Error('Rejected command')
   if(data.encoding==='hex'&&!/^(?:[a-f0-9]{2})+$/i.test(data.data))throw Error('Invalid hex')
   if(data.encoding==='ascii'&&/[^\x00-\x7f]/.test(data.data))throw Error('Invalid ASCII')
   await new Promise((resolve,reject)=>port.write(Buffer.from(data.data,data.encoding==='hex'?'hex':'ascii'),error=>error?reject(error):port.drain(error=>error?reject(error):resolve())))
  }else throw Error('Unsupported command')
  send({type:'ack',id:data.id,ok:true});log('Authenticated command applied')
 }catch{send({type:'ack',id:data.id,ok:false});log('Command failed')}finally{commandBusy=false}
}
function connect(){if(stopping)return
 const ws=new WebSocket(url,{headers:{Authorization:`Bearer ${token}`},handshakeTimeout:10000,maxPayload:16384,rejectUnauthorized:true});socket=ws
 const arm=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>ws.terminate(),20000)}
 ws.on('open',()=>{networkAttempt=0;arm();status();log('Server connected')});ws.on('ping',arm)
 ws.on('message',handleCommand);ws.on('error',()=>log('Server connection error'))
 ws.on('close',()=>{clearTimeout(watchdog);log('Server disconnected');if(!stopping)networkTimer=setTimeout(connect,delay(networkAttempt++))})
}
const heartbeat=setInterval(status,3000)
function shutdown(){stopping=true;generation++;clearInterval(heartbeat);clearInterval(simulationTimer);clearTimeout(serialTimer);clearTimeout(networkTimer);clearTimeout(watchdog);socket?.terminate();if(port?.isOpen)port.close();setTimeout(()=>process.exit(0),500).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
openSerial();connect()

import '../config/env.js'
import {WebSocketServer,WebSocket} from 'ws'
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto'
import {z} from 'zod'

const frameSchema=z.object({type:z.literal('reading'),weight:z.number().finite().min(-1e9).max(1e9).nullable(),valid:z.boolean(),unit:z.enum(['kg','g','t']),stable:z.boolean().nullable(),timestamp:z.string().datetime(),ascii:z.string().max(1024),hex:z.string().regex(/^[a-f0-9]*$/i).max(2048)}).strict()
const statusSchema=z.object({type:z.literal('status'),simulation:z.boolean(),connected:z.boolean(),error:z.string().max(200).nullable(),serial:z.object({path:z.string().max(32),baudRate:z.number().int(),dataBits:z.number(),parity:z.string().max(8),stopBits:z.number(),rtscts:z.boolean(),xon:z.boolean(),xoff:z.boolean()}).strict()}).strict()
export const serialOptions=z.object({path:z.string().regex(/^COM[1-9][0-9]*$/i).or(z.literal('auto')),baudRate:z.number().int().min(300).max(921600),dataBits:z.union([z.literal(7),z.literal(8)]),parity:z.enum(['none','even','odd','mark','space']),stopBits:z.union([z.literal(1),z.literal(2)]),rtscts:z.boolean(),xon:z.boolean(),xoff:z.boolean()}).strict()
const digest=s=>createHash('sha256').update(s).digest()
export class ScaleService{
 constructor(devices=[],{ttl=5000,now=Date.now}={}){this.devices=devices;this.ttl=ttl;this.now=now;this.states=new Map();this.pending=new Map()}
 authenticate(id,token){const d=this.devices.find(d=>d.id===id);return d&&typeof token==='string'&&timingSafeEqual(digest(token),Buffer.from(d.tokenHash,'hex'))?d:null}
 connect(device,ws){const previous=this.states.get(device.id);if(previous?.ws)return false;this.states.set(device.id,{device,ws,lastSeen:this.now(),connected:false,frames:[],raw:null,lastValid:previous?.lastValid||null,lastTimestamp:previous?.lastTimestamp||null,reading:null,error:null});return true}
 receive(id,data){const s=this.states.get(id);if(!s?.ws)throw Error('Disconnected');s.lastSeen=this.now()
  if(data.type==='status'){const v=statusSchema.parse(data);if(v.simulation!==s.device.simulation)throw Error('Simulation identity mismatch');Object.assign(s,{connected:v.connected,error:v.error,serial:v.serial,identified:true});if(!v.connected)s.reading=null;return}
  if(!s.identified)throw Error('Status required')
  if(data.type==='raw'){s.raw=z.object({type:z.literal('raw'),ascii:z.string().max(1024),hex:z.string().regex(/^[a-f0-9]*$/i).max(2048),timestamp:z.string().datetime()}).strict().parse(data);s.lastDataAt=this.now();return}
  if(data.type==='ack'){const v=z.object({type:z.literal('ack'),id:z.string().uuid(),ok:z.boolean()}).strict().parse(data);const p=this.pending.get(v.id);if(p?.scaleId===id){clearTimeout(p.timer);this.pending.delete(v.id);p.resolve(v)}return}
  const v=frameSchema.parse(data),age=this.now()-Date.parse(v.timestamp)
  if(age>this.ttl||age < -2000)throw Error('Expired reading')
  if(v.valid&&v.weight===null)throw Error('Invalid weight')
  s.reading={...v,receivedAt:Math.min(this.now(),Date.parse(v.timestamp))};s.lastDataAt=this.now();s.lastTimestamp=v.timestamp;s.frames=[{ascii:v.ascii,hex:v.hex,timestamp:v.timestamp},...s.frames].slice(0,10)
  if(v.valid)s.lastValid=s.reading
 }
 disconnect(id,ws){const s=this.states.get(id);if(s?.ws!==ws)return;s.ws=null;s.connected=false;s.reading=null;for(const [key,p] of this.pending)if(p.scaleId===id){clearTimeout(p.timer);p.resolve({ok:false});this.pending.delete(key)}}
 snapshot(id,companyId,diagnostics=false){const d=this.devices.find(d=>d.id===id&&d.companyId===Number(companyId));if(!d)return null
  const s=this.states.get(id),online=!!s?.ws&&this.now()-s.lastSeen<15000,live=online&&s.connected,reading=live&&s.reading?.valid&&this.now()-s.reading.receivedAt<this.ttl?s.reading:null
  return {id,simulation:d.simulation,status:!online?'disconnected':s.error?'error':!live?'disconnected':!s.lastDataAt||this.now()-s.lastDataAt>=this.ttl?'no-data':'receiving',reading:reading?{weight:reading.weight,unit:reading.unit,stable:reading.stable,timestamp:reading.timestamp,expiresInMs:this.ttl-(this.now()-reading.receivedAt)}:null,lastTimestamp:s?.lastTimestamp||null,...(diagnostics?{serial:s?.serial,frames:s?.frames||[],raw:s?.raw,error:s?.error,agentOnline:online}:{})}
 }
 list(companyId,diagnostics){return this.devices.filter(d=>d.companyId===Number(companyId)).map(d=>this.snapshot(d.id,companyId,diagnostics))}
 command(id,command){const s=this.states.get(id);if(!s?.ws||s.ws.readyState!==WebSocket.OPEN)throw Error('Agent unavailable');const commandId=randomUUID();return new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(commandId);resolve({ok:false})},10000);this.pending.set(commandId,{scaleId:id,resolve,timer});s.ws.send(JSON.stringify({...command,id:commandId}))})}
}
const deviceSchema=z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),companyId:z.number().int().positive(),tokenHash:z.string().regex(/^[a-f0-9]{64}$/),simulation:z.boolean().default(false)}).strict()).refine(ds=>new Set(ds.map(d=>d.id)).size===ds.length)
export const scales=new ScaleService(deviceSchema.parse(JSON.parse(process.env.SCALE_DEVICES||'[]')))
export function attachScaleAgent(server,service=scales){
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false})
 const upgrade=(req,socket,head)=>{const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/scale/agent')return
  const device=service.authenticate(url.searchParams.get('id'),req.headers.authorization?.replace(/^Bearer /,''))
  if(!device||req.headers.origin){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return}
  if(service.states.get(device.id)?.ws){socket.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');return}
  wss.handleUpgrade(req,socket,head,ws=>{
   if(!service.connect(device,ws)){ws.close(1008);return}let count=0,windowStart=Date.now();ws.alive=true
   ws.on('pong',()=>{ws.alive=true;const s=service.states.get(device.id);if(s?.ws===ws)s.lastSeen=Date.now()})
   ws.on('message',raw=>{try{if(Date.now()-windowStart>1000){count=0;windowStart=Date.now()}if(++count>50)throw Error('Rate');service.receive(device.id,JSON.parse(raw))}catch{ws.close(1008,'Invalid message')}})
   ws.on('close',()=>service.disconnect(device.id,ws));ws.on('error',()=>ws.terminate())
  })
 };server.on('upgrade',upgrade)
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},5000);heartbeat.unref()
 return ()=>{clearInterval(heartbeat);server.off('upgrade',upgrade);for(const ws of wss.clients)ws.terminate();wss.close()}
}

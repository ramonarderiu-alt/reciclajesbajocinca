import {z} from 'zod'
export const serialSchema=z.object({path:z.string().regex(/^COM[1-9][0-9]*$/i).or(z.literal('auto')),baudRate:z.number().int().min(300).max(921600),dataBits:z.union([z.literal(7),z.literal(8)]),parity:z.enum(['none','even','odd','mark','space']),stopBits:z.union([z.literal(1),z.literal(2)]),rtscts:z.boolean(),xon:z.boolean(),xoff:z.boolean()}).strict()
export const protocolSchema=z.object({framing:z.enum(['CR','LF','CRLF','fixed']),length:z.number().int().min(1).max(1024),parser:z.enum(['disabled','regex']),pattern:z.string().max(200),unit:z.enum(['kg','g','t']),stablePattern:z.string().max(100)}).strict()
// Patterns are local configuration only. Remote configuration may change serial options, never regex code.
export function createDecoder(config,onFrame){
 const p=protocolSchema.parse(config),separator={CR:'\r',LF:'\n',CRLF:'\r\n'}[p.framing]
 const regex=p.parser==='regex'?new RegExp(p.pattern):null,stable=p.stablePattern?new RegExp(p.stablePattern):null
 let pending=Buffer.alloc(0)
 return chunk=>{
  pending=Buffer.concat([pending,chunk]);if(pending.length>8192){pending=Buffer.alloc(0);throw new Error('Frame buffer exceeded')}
  for(;;){const end=p.framing==='fixed'?(pending.length>=p.length?p.length:-1):pending.indexOf(separator);if(end<0)break
   const frame=pending.subarray(0,end);pending=pending.subarray(end+(p.framing==='fixed'?0:separator.length))
   const ascii=frame.toString('ascii'),match=regex?.exec(ascii),numeric=match?.[1]?.trim(),weight=numeric&&/^[+-]?(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)$/.test(numeric)?Number(numeric.replace(',','.')):NaN
   onFrame({ascii:ascii.slice(0,1024),hex:frame.toString('hex').slice(0,2048),weight:Number.isFinite(weight)?weight:null,valid:Number.isFinite(weight),unit:p.unit,stable:stable?stable.test(ascii):null,timestamp:new Date().toISOString()})
  }
 }
}

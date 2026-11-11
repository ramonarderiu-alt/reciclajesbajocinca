import {readFileSync} from 'node:fs'

const manifest=JSON.parse(readFileSync(new URL('../../../modules/accounting/database/objects.json',import.meta.url),'utf8'))
const tables=new Set(manifest.tables),objects=new Set(manifest.objects)
export const accountingTablePrefix='accounting_'

// Only schema identifiers are renamed. Values, aliases, column names and the
// original backup format retain the names used by the accounting domain.
export function accountingSql(sql){
 if(typeof sql!=='string')return {...sql,sql:accountingSql(sql.sql)}
 const tokens=sql.match(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`(?:[^`]|``)*`|--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][\w$]*|\s+|[^\s]/g)||[]
 const code=tokens.map((text,index)=>({text,index})).filter(token=>!/^\s|^--|^#|^\/\*/.test(token.text))
 let tableExpected=false
 const metadata=/\binformation_schema\s*\./i.test(sql)
 for(let position=0;position<code.length;position++){
  const {text,index}=code[position],next=code[position+1]?.text,previous=code[position-1]?.text?.toUpperCase()
  if(text.startsWith("'")||text.startsWith('"')){
   const quote=text[0],value=text.slice(1,-1).replaceAll(quote+quote,quote).replace(/\\(['"\\])/g,'$1')
   let replacement=value
   if(metadata&&tables.has(value))replacement=accountingTablePrefix+value
   // Migration 004 prepares DDL stored in a SQL string.
   else if(/^\s*(?:ALTER|CREATE|DROP)\s+(?:TABLE|TRIGGER)\b/i.test(value))replacement=accountingSql(value)
   if(replacement!==value)tokens[index]=quote+replacement.replaceAll(quote,quote+quote)+quote
   continue
  }
  const quoted=text.startsWith('`'),name=quoted?text.slice(1,-1).replaceAll('``','`'):text
  if(!/^[A-Za-z_][\w$]*$/.test(name))continue
  const upper=name.toUpperCase()
  if(tableExpected&&['IF','NOT','EXISTS'].includes(upper))continue
  const automaticCheck=[...tables].some(table=>name.startsWith(table+'_chk_'))
  if(objects.has(name)||automaticCheck||tables.has(name)&&(tableExpected||next==='.'||previous==='ON')){
   const replacement=accountingTablePrefix+name
   tokens[index]=quoted?'`'+replacement+'`':replacement
  }
  if(tableExpected)tableExpected=false
  if(['FROM','JOIN','INTO','UPDATE','REFERENCES','TABLE'].includes(upper))tableExpected=true
 }
 return tokens.join('')
}

const wrapped=new WeakMap()
export function accountingDatabase(client){
 if(wrapped.has(client))return wrapped.get(client)
 const proxy=new Proxy(client,{get(target,key){
  if(key==='execute'||key==='query')return (sql,...args)=>target[key](accountingSql(sql),...args)
  if(key==='getConnection')return async()=>accountingDatabase(await target.getConnection())
  const value=Reflect.get(target,key,target)
  return typeof value==='function'?value.bind(target):value
 }})
 wrapped.set(client,proxy)
 wrapped.set(proxy,proxy)
 return proxy
}

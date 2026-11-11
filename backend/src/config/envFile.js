import path from 'node:path'
import {fileURLToPath} from 'node:url'
import dotenv from 'dotenv'

const defaultEnvFile=fileURLToPath(new URL('../../.env',import.meta.url))

export function loadEnvFile({environment=process.env,cwd=process.cwd(),defaultPath=defaultEnvFile}={}){
 const explicitPath=environment.RBC_ENV_FILE
 const envFile=path.resolve(cwd,explicitPath||defaultPath)
 // Read separately so inherited process variables retain their normal precedence.
 const result=dotenv.config({path:envFile,processEnv:{},quiet:true})
 if(result.error&&(explicitPath||result.error.code!=='ENOENT'))throw new Error(`No es pot llegir el fitxer de configuració: ${envFile}`)
 const overriddenKeys=[]
 for(const [key,value] of Object.entries(result.parsed||{})){
  if(environment[key]!==undefined){if(environment[key]!==value)overriddenKeys.push(key)}
  else environment[key]=value
 }
 return {envFile,fileLoaded:!result.error,overriddenKeys:overriddenKeys.sort()}
}

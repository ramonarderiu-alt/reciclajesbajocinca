import {Router} from 'express'
import {authenticate,requirePermission} from '../middleware/auth.js'
import {scales,serialOptions} from '../services/scaleService.js'
import {audit} from '../repositories/dataRepository.js'
import {z} from 'zod'
import {createHash} from 'node:crypto'
const router=Router()
router.use(authenticate,requirePermission('scale.view'))
router.get('/',(req,res)=>res.json(scales.list(req.user.company_id,req.user.permissions.includes('scale.configure'))))
router.post('/:id/capture',(req,res)=>{const s=scales.snapshot(req.params.id,req.user.company_id);if(!s?.reading)return res.status(409).json({error:{message:'No hi ha pes vigent'}});res.json({...s,capturedAt:new Date().toISOString()})})
router.post('/:id/command',requirePermission('scale.configure'),async(req,res,next)=>{try{
 if(!scales.snapshot(req.params.id,req.user.company_id))return res.sendStatus(404)
 let command
 if(req.body.type==='configure')command={type:'configure',serial:serialOptions.parse(req.body.serial)}
 else{if(!req.user.permissions.includes('scale.command')||req.user.role_name!=='Administrador')return res.sendStatus(403)
 command=z.object({type:z.literal('manual'),encoding:z.enum(['ascii','hex']),data:z.string().min(1).max(256),confirmed:z.literal(true)}).strict().parse(req.body)
 if(command.encoding==='hex'&&!/^(?:[a-f0-9]{2})+$/i.test(command.data))return res.sendStatus(400)
 }
 const auditValue=command.type==='manual'?{type:command.type,encoding:command.encoding,confirmed:true,length:command.data.length,sha256:createHash('sha256').update(command.data).digest('hex')}:command
 await audit({userId:req.user.id,action:'scale.command.request',entity:'scale',recordId:req.params.id,newValues:auditValue,ip:req.ip})
 const result=await scales.command(req.params.id,command)
 await audit({userId:req.user.id,action:'scale.command.result',entity:'scale',recordId:req.params.id,newValues:result,ip:req.ip})
 res.status(result.ok?200:409).json(result)
 }catch(error){if(error instanceof z.ZodError)return res.status(400).json({error:{message:'Opcions no vàlides'}});next(error)}})
export default router

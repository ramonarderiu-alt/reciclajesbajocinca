import {Router} from 'express'
import {z} from 'zod'
import {pool} from '../config/db.js'
import {ticketOptions} from '../repositories/scaleTicketRepository.js'
const router=Router()
const weight=z.number().finite().min(0).max(99999999999)
export const ticketSchema=z.object({centre:z.string().trim().min(1).max(500),client:z.string().trim().min(1).max(40),plate:z.string().trim().min(1).max(30).transform(s=>s.toUpperCase()),weight:weight.refine(n=>n>0),date:z.string().datetime()}).strict()
export const tareSchema=z.object({weight,date:z.string().datetime()}).strict()
const sqlDate=s=>new Date(s).toISOString().slice(0,19).replace('T',' ')
router.get('/options',async(req,res,next)=>{try{res.json(await ticketOptions(req.user.company_id))}catch(e){next(e)}})
router.get('/pending',async(req,res,next)=>{try{const [rows]=await pool.execute('SELECT *,DATE_FORMAT(weighed_at,"%Y-%m-%dT%H:%i:%sZ") weighed_at FROM scale_tickets WHERE company_id=? AND tare_kg IS NULL ORDER BY weighed_at,id',[req.user.company_id]);res.json(rows)}catch(e){next(e)}})
router.post('/',async(req,res,next)=>{try{
 const v=ticketSchema.parse(req.body),options=await ticketOptions(req.user.company_id),client=options.centres.find(c=>c.centre_name===v.centre&&c.client_code===v.client)
 if(!client)return res.status(400).json({error:{message:'Selecciona un client del centre indicat'}})
 const [result]=await pool.execute('INSERT INTO scale_tickets(company_id,centre_name,client_code,client_name,vehicle_plate,gross_kg,weighed_at,created_by) VALUES(?,?,?,?,?,?,?,?)',[req.user.company_id,v.centre,v.client,client.client_name,v.plate,v.weight,sqlDate(v.date),req.user.id])
 res.status(201).json({id:result.insertId})
 }catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:{message:'Revisa les dades del tiquet'}});next(e)}})
router.put('/:id/tare',async(req,res,next)=>{try{
 const v=tareSchema.parse(req.body)
 const [result]=await pool.execute('UPDATE scale_tickets SET tare_kg=?,tared_at=? WHERE id=? AND company_id=? AND tare_kg IS NULL AND gross_kg>=? AND weighed_at<=?',[v.weight,sqlDate(v.date),req.params.id,req.user.company_id,v.weight,sqlDate(v.date)])
 if(!result.affectedRows)return res.status(409).json({error:{message:'La tara supera el pes brut, la data és anterior al pesatge o el tiquet ja no està pendent'}})
 res.json({ok:true})
 }catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:{message:'Tara o data no vàlida'}});next(e)}})
export default router

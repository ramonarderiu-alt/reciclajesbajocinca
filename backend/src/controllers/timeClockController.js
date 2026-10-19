import ExcelJS from 'exceljs'
import * as service from '../services/timeClockService.js'
import { punchSchema,rangeSchema,entryEditSchema,manualExitSchema,settingsSchema } from '../validations/timeClockValidation.js'
const meta=req=>({ip:req.ip,userAgent:req.get('user-agent')||''})
export const status=async(req,res)=>res.json(await service.status(req.user))
export const todayByEmail=async(req,res)=>res.json(await service.todayFor(req.user,u=>u.email.toLowerCase()===String(req.params.email).toLowerCase()))
export const todayByCode=async(req,res)=>res.json(await service.todayFor(req.user,u=>u.time_clock_code===req.params.code))
export const punch=async(req,res)=>res.status(201).json(await service.punch(punchSchema.parse(req.body),req.user,meta(req)))
export const workers=async(req,res)=>res.json(await service.currentWorkers(req.user))
export const recent=async(req,res)=>res.json(await service.recentFourDays(req.user))
export const mine=async(req,res)=>res.json(await service.personalRange(req.user,rangeSchema.parse(req.query)))
export const settings=async(req,res)=>res.json(await service.getSettings(req.user))
export const saveSettings=async(req,res)=>res.json(await service.updateSettings(req.user,settingsSchema.parse(req.body).exit_display_mode))
export const admin=async(req,res)=>res.json(await service.adminRange(req.user,rangeSchema.parse(req.query)))
export const payroll=async(req,res)=>res.json(await service.payroll(req.user,rangeSchema.parse(req.query)))
export const edit=async(req,res)=>res.json(await service.updateEntry(req.user,req.params.id,entryEditSchema.parse(req.body).punched_at))
export const addExit=async(req,res)=>res.status(201).json(await service.manualExit(req.user,req.params.id,manualExitSchema.parse(req.body).punched_at,req.ip))
export const operators=async(req,res)=>res.json(await service.multiOperators(req.user))
export const excess=async(req,res)=>{const range=rangeSchema.parse(req.query);res.json(await service.multiExcess(req.user,req.query.operator_id,range))}
const duration=minutes=>`${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min`
async function workbook(columns,rows,name,res){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(name);sheet.columns=columns;sheet.addRows(rows);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];const buffer=await book.xlsx.writeBuffer();res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))}
export async function exportAdmin(req,res){const q=rangeSchema.parse(req.query),rows=await service.adminRange(req.user,q);res.setHeader('Content-Disposition',`attachment; filename="control-horari-${q.from}-${q.to}.xlsx"`);await workbook(['Data','Empleat','Correu','Entrada','Ubicacio entrada','Sortida','Ubicacio sortida'].map(x=>({header:x,key:x,width:22})),rows.map(x=>({'Data':x.workDate,'Empleat':x.userName,'Correu':x.email,'Entrada':x.entry.punched_at,'Ubicacio entrada':x.entry.location_lat?`${x.entry.location_lat}, ${x.entry.location_lng}`:'Sense ubicacio','Sortida':x.exit?.punched_at||'Incompleta','Ubicacio sortida':x.exit?.location_lat?`${x.exit.location_lat}, ${x.exit.location_lng}`:'Sense ubicacio'})),'Control horari',res)}
export async function exportPayroll(req,res){const q=rangeSchema.parse(req.query),all=await service.payroll(req.user,q),term=q.search.toLowerCase(),rows=all.filter(x=>(!term||x.name.toLowerCase().includes(term)||x.email.toLowerCase().includes(term))&&(!q.role_id||x.roleId===q.role_id));res.setHeader('Content-Disposition',`attachment; filename="hores-a-pagar-${q.from}-${q.to}.xlsx"`);await workbook(['Empleat','Correu','Rol','Dies','Hores dia','Hores nit','Hores fitxades','Hores ordinaries','Extra real','Extra computada','Total a pagar','Incidencies'].map(x=>({header:x,key:x,width:20})),rows.map(x=>({'Empleat':x.name,'Correu':x.email,'Rol':x.roleName,'Dies':x.payableDays,'Hores dia':duration(x.dayMinutes||0),'Hores nit':duration(x.nightMinutes||0),'Hores fitxades':duration(x.workedMinutes),'Hores ordinaries':duration(x.ordinaryMinutes),'Extra real':duration(x.realExtraMinutes),'Extra computada':duration(x.computedExtraMinutes),'Total a pagar':duration(x.payableMinutes),'Incidencies':x.incompleteDays})),'Hores a pagar',res)}
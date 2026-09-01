import { z } from 'zod'
const date=z.iso.date(),coordinate=z.number()
export const rangeSchema=z.object({from:date,to:date,search:z.string().max(190).optional().default(''),role_id:z.coerce.number().int().positive().optional()}).refine(v=>v.from<=v.to,{message:'La data inicial no pot ser posterior a la final'}).refine(v=>(new Date(v.to)-new Date(v.from))/86400000<=92,{message:'El rang màxim és de 92 dies'})
export const punchSchema=z.object({code:z.string().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/).optional(),is_mobile:z.boolean(),lat:coordinate.min(-90).max(90).nullable().optional(),lng:coordinate.min(-180).max(180).nullable().optional(),accuracy:coordinate.min(0).nullable().optional()}).superRefine((v,c)=>{if((v.lat==null)!==(v.lng==null))c.addIssue({code:'custom',message:'Cal informar latitud i longitud'});if(v.is_mobile&&(v.lat==null||v.lng==null||v.accuracy==null))c.addIssue({code:'custom',message:'La ubicació és obligatòria des del mòbil'})})
export const entryEditSchema=z.object({punched_at:z.string().min(16).max(25)})
export const manualExitSchema=entryEditSchema
export const settingsSchema=z.object({exit_display_mode:z.enum(['real','theoretical_8h'])})

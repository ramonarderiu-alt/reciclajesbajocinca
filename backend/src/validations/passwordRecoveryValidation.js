import {z} from 'zod'

export const forgotPasswordSchema=z.object({username:z.string().trim().min(1).max(80)}).strict()
export const resetPasswordSchema=z.object({
 token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 password:z.string().min(8).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72,{message:'La contrasenya no pot superar els 72 bytes.'}),
 confirmPassword:z.string().min(8).max(72)
}).strict().refine(value=>value.password===value.confirmPassword,{path:['confirmPassword'],message:'Les contrasenyes no coincideixen.'})

import { ZodError } from 'zod'
export function notFoundHandler(req,res) { res.status(404).json({error:{code:'ROUTE_NOT_FOUND',message:'Ruta no trobada'}}) }
export function errorHandler(error,req,res,next) {
  if(res.headersSent) return next(error)
  if(error instanceof ZodError) return res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Dades no vàlides',details:error.issues}})
  const status=error.status||500; if(status>=500) console.error(error)
  res.status(status).json({error:{code:error.code||'INTERNAL_ERROR',message:status>=500?'Error intern del servidor':error.message,details:error.details}})
}

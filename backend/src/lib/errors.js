export class AppError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }) }
}
export const notFound = (message = 'Recurs no trobat') => new AppError(404, 'NOT_FOUND', message)

// Log operational codes only: driver messages and SQL can contain credentials or tokens.
export function errorCodes(error){
 const code=value=>typeof value==='string'&&/^[A-Z0-9_]+$/.test(value)?value:'UNKNOWN'
 const result={code:code(error?.code)}
 if(Number.isInteger(error?.errno))result.errno=error.errno
 if(typeof error?.sqlState==='string'&&/^[A-Z0-9]{5}$/.test(error.sqlState))result.sqlState=error.sqlState
 if(Number.isInteger(error?.responseCode))result.responseCode=error.responseCode
 if(error?.cause){
  result.causeCode=code(error.cause.code)
  if(Number.isInteger(error.cause.responseCode))result.causeResponseCode=error.cause.responseCode
 }
 return result
}

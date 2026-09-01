export class AppError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }) }
}
export const notFound = (message = 'Recurs no trobat') => new AppError(404, 'NOT_FOUND', message)

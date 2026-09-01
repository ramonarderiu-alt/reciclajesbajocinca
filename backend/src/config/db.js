import mysql from 'mysql2/promise'
import { env } from './env.js'
export const pool = mysql.createPool({ host:env.DB_HOST, port:env.DB_PORT, user:env.DB_USER, password:env.DB_PASSWORD, database:env.DB_NAME, waitForConnections:true, connectionLimit:10, namedPlaceholders:true, timezone:'Z', charset:'utf8mb4' })
export async function transaction(work) { const connection=await pool.getConnection(); try { await connection.beginTransaction(); const value=await work(connection); await connection.commit(); return value } catch(error) { await connection.rollback(); throw error } finally { connection.release() } }

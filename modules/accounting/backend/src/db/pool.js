import mysql from './mysql.js';
import { config } from '../config.js';
export const pool = mysql.createPool(config.database);

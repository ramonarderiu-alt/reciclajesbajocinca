import mysql from 'mysql2/promise';
import {accountingDatabase} from '../../../../../backend/src/repositories/accountingSqlNamespace.js';
export default {
 createPool:options=>accountingDatabase(mysql.createPool(options)),
 createConnection:async options=>accountingDatabase(await mysql.createConnection(options)),
};

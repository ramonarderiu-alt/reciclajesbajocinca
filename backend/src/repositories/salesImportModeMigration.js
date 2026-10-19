// Keep the actual PDF hash; each replacement is a separately reviewed attempt.
export async function ensureSalesImportModes(connection){
 const [columns]=await connection.query('SHOW COLUMNS FROM sales_imports');
 for(const [name,definition] of Object.entries({import_mode:"ENUM('append','overwrite') NOT NULL DEFAULT 'append'",import_attempt:"CHAR(36) NOT NULL DEFAULT ''",replaced_row_count:'INT NOT NULL DEFAULT 0'})){
  if(!columns.some(column=>column.Field===name))await connection.query('ALTER TABLE sales_imports ADD COLUMN '+name+' '+definition);
 }
 const [indexes]=await connection.query('SHOW INDEX FROM sales_imports');
 const unique=new Map();
 for(const index of indexes.filter(index=>!index.Non_unique&&index.Key_name!=='PRIMARY')){
  if(!unique.has(index.Key_name))unique.set(index.Key_name,[]);
  unique.get(index.Key_name)[index.Seq_in_index-1]=index.Column_name;
 }
 if(![...unique.values()].some(fields=>fields.join(',')==='company_id,file_hash,import_attempt'))await connection.query('ALTER TABLE sales_imports ADD UNIQUE INDEX sales_import_attempt(company_id,file_hash,import_attempt)');
 for(const [name,fields] of unique)if(fields.join(',')==='company_id,file_hash')await connection.query('ALTER TABLE sales_imports DROP INDEX '+String.fromCharCode(96)+name.replaceAll(String.fromCharCode(96),String.fromCharCode(96,96))+String.fromCharCode(96));
}

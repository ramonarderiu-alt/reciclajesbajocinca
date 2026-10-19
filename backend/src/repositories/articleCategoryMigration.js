async function ensureCategory(connection,category){
 const [[column]]=await connection.query("SHOW COLUMNS FROM sales_article_compost_group LIKE 'category'");
 if(!column)throw new Error('No existeix la columna de classificació dels articles.');
 if(column.Type.includes("'"+category+"'"))return;
 // Append the new enum value, preserving existing category values and ordering.
 if(!column.Type.startsWith('enum('))throw new Error('Tipus de classificació inesperat.');
 const type=column.Type.slice(0,-1)+",'"+category+"')";
 await connection.query('ALTER TABLE sales_article_compost_group MODIFY category '+type+' NULL');
}

export const ensureFruitCategory=connection=>ensureCategory(connection,'fruita')
export const ensurePaperCategory=connection=>ensureCategory(connection,'paper')

export const ensureWoodAndInadequateCategories=async connection=>{
 await ensureCategory(connection,'fusta')
 await ensureCategory(connection,'mat_inade')
}

export function safeLoginRedirect(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return '/'
 try{const url=new URL(value,'https://app.local');return url.origin==='https://app.local'&&url.pathname!=='/login'?url.pathname+url.search+url.hash:'/'}catch{return '/'}
}

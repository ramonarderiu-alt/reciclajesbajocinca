// The frame shares the host session; credentials never appear in an iframe URL.
const nativeFetch=window.fetch.bind(window);
let pendingRefresh;
function refreshSession(){
 if(pendingRefresh)return pendingRefresh;
 pendingRefresh=new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const finish=(error)=>{clearTimeout(timer);window.removeEventListener('message',receive);error?reject(error):resolve();};
  const receive=event=>{
   if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='accounting:session'||event.data.requestId!==requestId)return;
   finish(event.data.success?null:new Error('HOST_SESSION_EXPIRED'));
  };
  const timer=setTimeout(()=>finish(new Error('HOST_SESSION_UNAVAILABLE')),12000);
  window.addEventListener('message',receive);
  window.parent.postMessage({type:'accounting:refresh-session',requestId},location.origin);
 }).finally(()=>{pendingRefresh=null;});
 return pendingRefresh;
}
window.fetch=async(input,options)=>{
 const url=new URL(input instanceof Request?input.url:input,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
 // Module paths are relative to its API, including /accounting/* reports.
 // That segment belongs to the domain route and must follow the host mount.
 url.pathname='/api/accounting'+url.pathname.slice(4);
 const request=new Request(input instanceof Request?new Request(url,input):url,options);
 const send=()=>{
  const headers=new Headers(request.headers),token=sessionStorage.getItem('accessToken');
  if(token)headers.set('Authorization','Bearer '+token);
  return nativeFetch(new Request(request.clone(),{headers}));
 };
 const response=await send();
 if(response.status!==401)return response;
 try{await refreshSession();return send();}catch{return response;}
};

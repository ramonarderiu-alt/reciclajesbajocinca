export function normalizeDescriptionCode(value){
 const text=String(value??'').trim();
 return (text.startsWith('(')&&text.endsWith(')')?text.slice(1,-1):text).replace(/\s+/g,'').toUpperCase();
}
export function matchesDescriptionCode(description,code){
 const target=normalizeDescriptionCode(code);
 return !!target&&[...String(description??'').matchAll(/\(([^()]*)\)/g)].some(match=>normalizeDescriptionCode(match[1])===target);
}

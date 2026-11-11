const boolean=value=>value===true||value===1||value==='1'

export const emptyUserForm=()=>({name:'',username:'',email:'',role_id:'',password:'',is_active:true,time_clock_code:null,multi_time_clock_enabled:false,time_clock_day_night_columns_enabled:false,time_clock_management_enabled:false,parent_user_id:null,overtime_base_minutes:480,overtime_half_threshold_minutes:25,overtime_full_threshold_minutes:55})

export function editUserForm(user){
 return {...emptyUserForm(),...user,password:'',is_active:boolean(user.is_active),multi_time_clock_enabled:boolean(user.multi_time_clock_enabled),time_clock_day_night_columns_enabled:boolean(user.time_clock_day_night_columns_enabled),time_clock_management_enabled:boolean(user.time_clock_management_enabled),parent_user_id:user.parent_user_id||null}
}

export function userPayload(form){
 const payload={name:form.name,username:form.username,email:form.email,role_id:form.role_id,is_active:boolean(form.is_active)}
 if(form.password)payload.password=form.password
 return payload
}

export function timeClockPayload(value){
 const form={...emptyUserForm(),...value}
 return {time_clock_code:form.time_clock_code||null,multi_time_clock_enabled:boolean(form.multi_time_clock_enabled),time_clock_day_night_columns_enabled:boolean(form.time_clock_day_night_columns_enabled),time_clock_management_enabled:boolean(form.time_clock_management_enabled),parent_user_id:form.parent_user_id||null,overtime_base_minutes:form.overtime_base_minutes,overtime_half_threshold_minutes:form.overtime_half_threshold_minutes,overtime_full_threshold_minutes:form.overtime_full_threshold_minutes}
}

export const timeClockChanged=(form,user)=>JSON.stringify(timeClockPayload(form))!==JSON.stringify(timeClockPayload(user))

const labels={name:'nom',username:'nom d’usuari',email:'correu electrònic',role_id:'rol',password:'contrasenya',is_active:'estat de l’usuari',time_clock_code:'codi de fitxatge',multi_time_clock_enabled:'multifitxatge',time_clock_day_night_columns_enabled:'columnes de dia i nit',time_clock_management_enabled:'gestió del control horari',parent_user_id:'usuari pare',overtime_base_minutes:'minuts ordinaris',overtime_half_threshold_minutes:'llindar de mitja hora',overtime_full_threshold_minutes:'llindar d’hora completa'}
export function userFormError(error){
 if(error.code!=='VALIDATION_ERROR'||!Array.isArray(error.details))return error.message
 const fields=[...new Set(error.details.map(issue=>labels[issue.path?.[0]]||issue.message).filter(Boolean))]
 return fields.length?`Revisa aquestes dades: ${fields.join('; ')}.`:error.message
}

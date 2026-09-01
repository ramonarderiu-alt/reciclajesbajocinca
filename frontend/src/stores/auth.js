import { reactive,computed } from 'vue'
import { api,setToken } from '../services/api.js'
export const auth=reactive({user:null,ready:false})
export const can=permission=>!!auth.user?.permissions?.includes(permission)
export async function login(credentials){const result=await api.post('/auth/login',credentials);setToken(result.accessToken);auth.user=result.user}
export async function restore(){try{auth.user=await api.get('/auth/me')}catch{try{const result=await api.post('/auth/refresh');setToken(result.accessToken);auth.user=result.user}catch{setToken(null);auth.user=null}}finally{auth.ready=true}}
export async function logout(){await api.logout();auth.user=null}
export const authenticated=computed(()=>!!auth.user)

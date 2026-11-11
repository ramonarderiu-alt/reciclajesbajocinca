import { computed, readonly, ref } from 'vue';
import { getContext } from '../services/api.js';
import { api } from '../services/accounting.js';
import { setCompanyId } from '../services/company.js';
import { latestExercise } from '../../../shared/report-periods.js';
const company = ref(null), companies = ref([]), exercises = ref([]), selectedId = ref(''), loading = ref(false), error = ref('');
let generation=0;
const selectedExercise = computed(() => exercises.value.find(item => String(item.id) === selectedId.value) ?? null);
async function refresh(companyId, { latest = false } = {}) {
  const ticket=++generation;
  loading.value = true; error.value = '';
  try {
    const list=await api('/companies');if(ticket!==generation)return;companies.value=list;
    if(!list.length){company.value=null;exercises.value=[];selectedId.value='';setCompanyId('');return;}
    let requested = typeof companyId === 'string' ? companyId : String(company.value?.id || '');
    try { requested ||= sessionStorage.getItem('company') || ''; } catch {}
    if (requested && !companies.value.some(item => String(item.id) === requested)) requested = '';
    requested ||= String(list[0].id);
    const data = await getContext(requested);
    if(ticket!==generation)return;
    setCompanyId(data.company.id);
    company.value = data.company; exercises.value = data.exercises;
    let remembered = '';
    try { remembered = sessionStorage.getItem('exercise:' + data.company.id) || ''; sessionStorage.setItem('company', String(data.company.id)); } catch {}
    const selected = (latest ? latestExercise(data.exercises) : data.exercises.find(item => String(item.id) === remembered))
      || data.exercises.find(item => item.is_default && item.status === 'open')
      || data.exercises.find(item => item.status === 'open') || data.exercises[0];
    selectExercise(selected ? String(selected.id) : '');
  } catch (cause) {
    if(ticket===generation){error.value = cause.code; company.value = null; exercises.value = []; selectedId.value = ''; setCompanyId('');}
  } finally { if(ticket===generation)loading.value = false; }
}
function clear({forget=false}={}){generation++;company.value=null;companies.value=[];exercises.value=[];selectedId.value='';error.value='';loading.value=false;setCompanyId('');if(forget)try{sessionStorage.removeItem('company');for(const key of Object.keys(sessionStorage))if(key.startsWith('exercise:'))sessionStorage.removeItem(key);}catch{}}
// Company shortcuts always open the latest exercise; routine refresh keeps a manual selection.
async function selectCompany(companyId) {
  if (loading.value) return;
  const requested = String(companyId);
  if (String(company.value?.id) === requested) {
    const latest = latestExercise(exercises.value);
    selectExercise(latest ? String(latest.id) : '');
  } else await refresh(requested, { latest: true });
}
function selectExercise(id) {
  selectedId.value = exercises.value.some(item => String(item.id) === id) ? id : '';
  try { if (company.value) sessionStorage.setItem('exercise:' + company.value.id, selectedId.value); } catch {}
}
function updateExerciseStatus(exerciseId,status) {
  if(!['open','closed'].includes(status))return;
  const exercise=exercises.value.find(row=>String(row.id)===String(exerciseId));if(exercise)exercise.status=status;
}
async function reloadData() {
  const companyId=company.value?.id;if(!companyId)return;
  const [data,list]=await Promise.all([getContext(String(companyId)),api('/companies')]);
  if(company.value?.id!==companyId)return;
  company.value=data.company;companies.value=list;exercises.value=data.exercises;
  if(!data.exercises.some(row=>String(row.id)===selectedId.value))selectExercise(String((data.exercises.find(row=>row.is_default)||data.exercises[0])?.id||''));
}
export function useContext() {
  return { company: readonly(company), companies: readonly(companies), exercises: readonly(exercises), selectedId: readonly(selectedId),
    loading: readonly(loading), error: readonly(error), selectedExercise, refresh, clear,selectCompany, selectExercise,updateExerciseStatus,reloadData };
}

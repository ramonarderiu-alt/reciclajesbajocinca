import test from 'node:test'
import assert from 'node:assert/strict'
import { splitDayNight,pairEntries,roundComputed,calculatePayroll,parseLocalDateTime,shiftFor } from '../src/services/timeClockCalculationService.js'
import { punchSchema,rangeSchema } from '../src/validations/timeClockValidation.js'
import { managementAllowed } from '../src/services/timeClockService.js'

const entry=(type,date,id=1)=>({id,entry_type:type,punched_at:new Date(date)})
test('agrupa alternança entrada-sortida i diversos intervals',()=>{const rows=[entry('in','2026-08-20T06:00:00Z',1),entry('out','2026-08-20T10:00:00Z',2),entry('in','2026-08-20T11:00:00Z',3),entry('out','2026-08-20T15:00:00Z',4)];const result=pairEntries(rows);assert.equal(result.length,2);assert.equal(result.reduce((n,x)=>n+x.totalMinutes,0),480)})
test('una jornada nocturna acaba l’endemà i separa dia i nit',()=>{const result=splitDayNight('2026-08-20T19:00:00Z','2026-08-21T05:00:00Z');assert.deepEqual(result,{dayMinutes:120,nightMinutes:480,totalMinutes:600})})
test('classifica els límits de torn en hora de Madrid',()=>{assert.equal(shiftFor(parseLocalDateTime('2026-08-20T06:00')),'day');assert.equal(shiftFor(parseLocalDateTime('2026-08-20T22:00')),'night')})
test('aplica exactament els llindars 24, 25, 54 i 55',()=>{assert.equal(roundComputed(24),0);assert.equal(roundComputed(25),30);assert.equal(roundComputed(54),30);assert.equal(roundComputed(55),60)})
test('calcula ordinàries i extres dia per dia',()=>{const result=calculatePayroll([{totalMinutes:504,incomplete:false},{totalMinutes:505,incomplete:false},{totalMinutes:535,incomplete:false}]);assert.equal(result.ordinaryMinutes,1440);assert.equal(result.computedExtraMinutes,90);assert.equal(result.realExtraMinutes,104)})
test('exclou jornades incompletes de les hores pagables',()=>{const result=calculatePayroll([{totalMinutes:600,incomplete:true},{totalMinutes:480,incomplete:false}]);assert.equal(result.payableDays,1);assert.equal(result.incompleteDays,1);assert.equal(result.workedMinutes,480);assert.equal(result.payableMinutes,480)})
test('exigeix geolocalització completa en mòbil',()=>{assert.equal(punchSchema.safeParse({is_mobile:true}).success,false);assert.equal(punchSchema.safeParse({is_mobile:true,lat:41.2,lng:0.7,accuracy:10}).success,true);assert.equal(punchSchema.safeParse({is_mobile:false,lat:41.2}).success,false)})
test('valida el rang màxim de 92 dies',()=>{assert.equal(rangeSchema.safeParse({from:'2026-01-01',to:'2026-04-03'}).success,true);assert.equal(rangeSchema.safeParse({from:'2026-01-01',to:'2026-04-04'}).success,false);assert.equal(rangeSchema.safeParse({from:'2026-02-01',to:'2026-01-01'}).success,false)})
test('rebutja hores inexistents pel canvi d’estiu a Madrid',()=>{assert.equal(parseLocalDateTime('2026-03-29T02:30'),null);assert.ok(parseLocalDateTime('2026-10-25T02:30'))})
test('diferencia supervisor, gestor delegat i usuari normal',()=>{assert.equal(managementAllowed({role_name:'Supervisor'}),true);assert.equal(managementAllowed({role_name:'Usuari',time_clock_management_enabled:true}),true);assert.equal(managementAllowed({role_name:'Usuari',time_clock_management_enabled:false}),false)})

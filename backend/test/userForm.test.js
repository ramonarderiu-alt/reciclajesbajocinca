import test from 'node:test'
import assert from 'node:assert/strict'
import {editUserForm,emptyUserForm,userPayload,timeClockPayload,timeClockChanged,userFormError} from '../../frontend/src/services/userForm.js'

const user={id:9,name:'Usuari de prova',username:'prova',email:'prova@example.test',role_id:1,is_active:1,time_clock_code:null,multi_time_clock_enabled:0,time_clock_day_night_columns_enabled:1,time_clock_management_enabled:0,parent_user_id:null,overtime_base_minutes:480,overtime_half_threshold_minutes:25,overtime_full_threshold_minutes:55,role_name:'Usuari'}

test('canvi de rol: omet la contrasenya buida i conserva intacta la configuració de fitxatge',()=>{
 const form=editUserForm(user)
 form.role_id=2
 const body=userPayload(form)
 assert.equal(body.role_id,2)
 assert.equal(body.is_active,true)
 assert.equal('password' in body,false)
 assert.equal('time_clock_code' in body,false)
 assert.equal('role_name' in body,false)
 assert.equal('id' in body,false)
 assert.equal(timeClockChanged(form,user),false)
})

test('edició: converteix els indicadors 0/1 de MySQL en booleans i conserva les columnes de dia i nit',()=>{
 const form=editUserForm(user),body=timeClockPayload(form)
 assert.equal(form.multi_time_clock_enabled,false)
 assert.equal(form.time_clock_day_night_columns_enabled,true)
 assert.equal(form.time_clock_management_enabled,false)
 assert.equal(typeof body.multi_time_clock_enabled,'boolean')
 assert.equal(typeof body.time_clock_day_night_columns_enabled,'boolean')
 assert.equal(typeof body.time_clock_management_enabled,'boolean')
 form.multi_time_clock_enabled=true
 assert.equal(timeClockChanged(form,user),true)
 assert.equal(timeClockPayload(form).multi_time_clock_enabled,true)
 assert.equal(timeClockPayload(form).time_clock_day_night_columns_enabled,true)
 assert.equal(editUserForm({...user,is_active:'0'}).is_active,false)
})

test('edició i creació: només inclou la contrasenya quan se n’ha introduït una',()=>{
 const form=emptyUserForm()
 assert.equal('password' in userPayload(form),false)
 form.password='nova-contrasenya'
 assert.equal(userPayload(form).password,'nova-contrasenya')
})

test('validació del formulari: identifica el camp rebutjat i conserva els errors de negoci',()=>{
 assert.equal(userFormError({code:'VALIDATION_ERROR',message:'Dades no vàlides',details:[{path:['email'],message:'Invalid email'},{path:['email'],message:'Too long'}]}),'Revisa aquestes dades: correu electrònic.')
 assert.match(userFormError({code:'VALIDATION_ERROR',message:'Dades no vàlides',details:[{path:[],message:'El llindar de mitja hora ha de ser inferior al d’una hora'}]}),/El llindar de mitja hora/)
 assert.equal(userFormError({code:'USER_EXISTS',message:'El nom d’usuari o el correu ja existeix'}),'El nom d’usuari o el correu ja existeix')
})

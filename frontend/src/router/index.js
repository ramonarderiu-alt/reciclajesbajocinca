import { createRouter,createWebHistory } from 'vue-router'
import { auth,restore,can } from '../stores/auth.js'
import LoginView from '../views/LoginView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import DashboardView from '../views/DashboardView.vue'
import UsersView from '../views/UsersView.vue'
import RolesView from '../views/RolesView.vue'
import CompanyView from '../views/CompanyView.vue'
import AuditView from '../views/AuditView.vue'
import SalesClientsView from '../views/SalesClientsView.vue'
import ClientSalesDetailView from '../views/ClientSalesDetailView.vue'
import TimeClockView from '../views/TimeClockView.vue'
const AccountingView=()=>import('../views/AccountingView.vue')
const router=createRouter({history:createWebHistory(),routes:[
 {path:'/login',component:LoginView,meta:{public:true,title:'Inici de sessió'}},
 {path:'/forgot-password',component:ForgotPasswordView,meta:{public:true,allowAuthenticated:true,title:'Recuperar la contrasenya'}},
 {path:'/reset-password',component:ResetPasswordView,meta:{public:true,allowAuthenticated:true,title:'Restablir la contrasenya'}},
 {path:'/',component:DashboardView,meta:{title:'Inici',permission:'dashboard.view'}},
 {path:'/users',component:UsersView,meta:{title:'Usuaris',permission:'users.view'}},
 {path:'/roles',component:RolesView,meta:{title:'Rols i permisos',permission:'roles.view'}},
 {path:'/company',component:CompanyView,meta:{title:'Configuració general',permission:'company.view'}},
 {path:'/audit',component:AuditView,meta:{title:'Auditoria',permission:'audit.view'}},
 {path:'/classification-prices',redirect:{path:'/sales-clients',query:{tab:'classification-prices'}}},
 {path:'/sales-clients',component:SalesClientsView,meta:{title:'Vendes clients',permission:'sales_clients.view'}},
 {path:'/sales-clients/:clientCode',name:'client-sales-detail',component:ClientSalesDetailView,meta:{title:'Historial del client',permission:'sales_clients.view'}},
 {path:'/time-clock',component:TimeClockView,meta:{title:'Fitxatge i control horari',permission:'time_clock.view'}},
 {path:'/scale',component:()=>import('../views/ScaleView.vue'),meta:{title:'Bàscula',permission:'scale.view'}},
 {path:'/accounting',component:AccountingView,meta:{title:'Comptabilitat',permission:'accounting.view'}},
 {path:'/:pathMatch(.*)*',redirect:'/'}]})
router.beforeEach(async to=>{if(!auth.ready)await restore();if(to.meta.public)return auth.user&&!to.meta.allowAuthenticated?'/':true;if(!auth.user)return {path:'/login',query:{redirect:to.fullPath}};if(to.meta.permission&&!can(to.meta.permission))return '/';return true})
export default router

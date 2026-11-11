// Optional browser check against npm run dev. API fixtures never modify real data.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {buildBalanceSheet} from '../backend/src/services/balance-sheet.js';
import {compareBalanceSheets} from '../backend/src/services/balance-comparison.js';

const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],frameRequests=[];
 let managing=false,expireAccountRequest=false,sessionRenewals=0;
 await page.addInitScript(()=>sessionStorage.setItem('accessToken','browser-test-token'));
 const company={id:1,name:'Reciclajes Bajo Cinca',subaccount_length:8,business_format:'general',logo_url:null};
 const exercises=[{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open',is_default:true},{id:2,name:'2025',start_date:'2025-01-01',end_date:'2025-12-31',status:'closed',is_default:false}];
 const emptyBalance=exercise=>({...buildBalanceSheet({company,exercise,from:exercise.start_date,to:exercise.end_date,rows:[],checks:{differences:{closing:'0.00'}}}),generated_result:'0.00'});
 const balance=emptyBalance(exercises[0]),previous=emptyBalance(exercises[1]);
 const permissions=()=>Object.fromEntries(['accounting_write','exercise_create','exercise_operations','data_import','exercise_clear','invoice_delete','entries_delete'].map(key=>[key,managing]));
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.frame()!==page.mainFrame()){
   frameRequests.push(path);
   assert.equal(request.headers().authorization,'Bearer browser-test-token','The frame preserves the identity of its own browser tab');
  }
  let body;
  if(path==='/api/auth/me')body={id:7,company_id:1,name:'Usuari de prova',role_name:'Prova',company_name:company.name,permissions:['dashboard.view','accounting.view',...(managing?['accounting.manage']:[])]};
  else if(path==='/api/accounting/session'){sessionRenewals++;body={ready:true};}
  else if(path==='/api/accounting/access/session')body={user:{id:7,key:'rbc:7',name:'Usuari de prova',role:'user',company_ids:[1],permissions:permissions()},users:[],master_setup_required:false};
  else if(path==='/api/accounting/context')body={company,exercises};
  else if(path==='/api/accounting/companies')body=[company];
  else if(path==='/api/accounting/accounts'){
   if(expireAccountRequest){expireAccountRequest=false;await route.fulfill({status:401,json:{error:{code:'INVALID_TOKEN'}}});return;}
   body=[{id:10,code:'43000001',parent_code:'4300',kind:'subaccount',description:'Client de prova'}];
  }else if(path==='/api/accounting/accounting/balance-sheet'){
   const compare=new URL(request.url()).searchParams.get('compare_previous')==='true';
   body={...balance,compare_previous:compare,...(compare?{comparison:{available:true,has_activity:false,previous,...compareBalanceSheets(balance,previous)}}:{})};
  }else if(/^\/api\/accounting\/(balance-sheet|profit-loss|trial-balance|ledger|review)$/.test(path)){
   await route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});return;
  }else body=[];
  await route.fulfill({status:200,json:body});
 });
 await page.goto(process.env.RBC_TEST_URL||'http://localhost:5174/accounting');
 const frame=page.frameLocator('iframe.accounting-frame');
 await frame.locator('.topbar-user-controls').waitFor();
 assert.equal((await frame.locator('.topbar-user-controls').innerText()).trim(),'Usuari de prova');
 await frame.locator('a[href$="#/cuentas"]').click();
 await frame.getByText('Client de prova',{exact:true}).waitFor();
 assert.equal(await frame.locator('.page-heading .primary').isDisabled(),true);
 const beforeRenewal=sessionRenewals;expireAccountRequest=true;
 await frame.locator('.filters .button').click();
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('tbody')?.textContent.includes('Client de prova'));
 assert.ok(sessionRenewals>beforeRenewal,'An expired iframe request renews through the host and retries');
 await frame.locator('a[href$="#/balance-situacion"]').click();
 await frame.locator('.balance-comparison').waitFor();
 assert.match(await frame.locator('.balance-comparison caption').innerText(),/2026 \/ 2025/);
 assert.ok(frameRequests.includes('/api/accounting/accounting/balance-sheet'),'Balance requests preserve the report route after the host API prefix');
 assert.equal(await frame.locator('.error-notice').count(),0);
 await frame.getByRole('button',{name:'Ocultar comparación',exact:true}).click();
 await frame.locator('.balance-columns').waitFor();
 assert.equal(await frame.locator('.error-notice').count(),0);
 managing=true;
 await page.setViewportSize({width:390,height:844});
 await page.reload();
 await frame.locator('.topbar-user-controls').waitFor();
 await page.locator('iframe').evaluate(element=>{element.contentWindow.location.hash='/cuentas';});
 await frame.getByText('Client de prova',{exact:true}).waitFor();
 assert.equal(await frame.locator('.page-heading .primary').isEnabled(),true);
 const bounds=await page.locator('iframe').boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391,'The frame fits a phone screen');
 assert.ok(frameRequests.every(path=>path.startsWith('/api/accounting/')),'All accounting requests use the isolated API');
 assert.deepEqual(errors,[]);
 console.log('Browser OK: shared session, expiry renewal, read-only and management, balance with and without comparison, report API prefix, mobile layout, no JavaScript errors.');
}finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);}
// Do not keep the test runner alive for an Edge transport shutdown timeout.
process.exit(0);

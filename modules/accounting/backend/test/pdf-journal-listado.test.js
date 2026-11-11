import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJournalPages,extractJournalPdf} from '../src/services/pdf-journal.js';
import {listadoPages} from '../test-support/journal-listado-fixture.js';
import {journalPagesPdf} from '../test-support/journal-fixture.js';

test('LISTADO preserves source numbers, wrapped headings, signed sides and page continuations',()=>{
 const source=parseJournalPages(listadoPages());
 assert.equal(source.layout,'listado_diario');assert.equal(source.subaccount_length,10);assert.equal(source.pages,2);
 assert.deepEqual(source.totals,{entries:3,lines:6,accounts:2,debit:'98.50',credit:'98.50',negative_entries:1,zero_entries:1,negative_lines:2,zero_lines:2,ignored_empty_lines:1});
 assert.deepEqual(source.entries.map(entry=>entry.number),[2026000000,2026000040,2026000042]);
 assert.equal(source.entries[0].entry_type,'opening');assert.equal(source.entries[0].lines[1].page,2);assert.equal(source.has_closing,false);
 assert.equal(source.entries[1].description,'RECTIFICACION FACTURA');assert.equal(source.entries[1].lines[0].debit,'-1.50');
 assert.equal(source.entries[1].lines[0].account_name,'BANCO ANTIGUO');assert.equal(source.accounts[0].description,'BANCO');
 assert.equal(source.entries[1].lines[1].source_line_number,3);assert.equal(source.entries[1].source_journal_code,undefined);
});

test('LISTADO rejects missing financial rows, changed totals, missing pages and mixed contexts',()=>{
 for(const [change,error] of [
  [pages=>{pages[1].items.find(item=>item.y===60&&item.x===455).text='99,00';},'REPORT_TOTAL_MISMATCH'],
  [pages=>{pages[1].items.find(item=>item.y===724&&item.x===455).text='99,00';},'ENTRY_TOTAL_MISMATCH'],
  [pages=>{pages[0].items.find(item=>item.y===724&&item.x===455).text='99,00';},'UNBALANCED_ENTRY'],
  [pages=>{pages[0].items=pages[0].items.filter(item=>!(item.y===724&&item.x===23.2));},'UNREAD_ROW'],
  [pages=>{pages[1].items.find(item=>item.y===654&&item.x===455).text='1,00';},'UNREAD_ROW'],
  [pages=>{pages[1].items.push({text:'UNKNOWN ACCOUNT',x:80.7,y:654,width:40});},'UNREAD_ROW'],
  [pages=>{pages[1].items=pages[1].items.filter(item=>item.text!=='Total general:');},'MISSING_REPORT_TOTAL'],
  [pages=>{pages[1].items.find(item=>item.y===13).text='3';},'INCOMPLETE_REPORT'],
  [pages=>{pages[1].items.find(item=>item.text.startsWith('EMPRESA:')).text='EMPRESA: OTHER SL';},'MULTIPLE_CONTEXTS'],
  [pages=>{pages[0].items.find(item=>item.text==='01/01/2026').text='31/12/2025';},'DATE_OUTSIDE_RANGE'],
  [pages=>{pages[1].items.find(item=>item.text==='2026000040').text='2026000000';},'DUPLICATE_NUMBER'],
  [pages=>{pages[0].items.find(item=>item.text==='5720000001').text='57200001';},'MIXED_ACCOUNT_LENGTHS'],
 ]){const pages=listadoPages();change(pages);assert.throws(()=>parseJournalPages(pages),new RegExp(error));}
});

test('LISTADO synthetic PDF is detected through the real byte extraction path',async()=>{
 const source=await extractJournalPdf(journalPagesPdf(listadoPages()));
 assert.equal(source.layout,'listado_diario');assert.equal(source.totals.debit,'98.50');assert.equal(source.totals.lines,6);
});

test('LISTADO preserves a single zero-value source line and still rejects missing or unbalanced entries',async()=>{
 const pages=listadoPages(undefined,{singleZero:true});
 const source=parseJournalPages(pages),entry=source.entries.at(-1);
 assert.equal(entry.number,2026000042);assert.equal(entry.lines.length,1);
 assert.equal(entry.lines[0].code,'5720000001');assert.equal(entry.lines[0].source_line_number,1);
 assert.equal(entry.lines[0].debit,'0.00');assert.equal(entry.lines[0].credit,'0.00');
 assert.equal(source.totals.lines,5);assert.equal(source.totals.zero_lines,1);assert.equal(source.totals.debit,'98.50');
 assert.deepEqual((await extractJournalPdf(journalPagesPdf(pages))).entries.at(-1),entry);
 const empty=structuredClone(pages);empty[1].items=empty[1].items.filter(item=>!(item.y>=572&&item.y<=576));
 assert.throws(()=>parseJournalPages(empty),/INVALID_ENTRY/);
 const unbalanced=structuredClone(pages);unbalanced[1].items.find(item=>item.x===455&&item.y===574).text='1,00';
 assert.throws(()=>parseJournalPages(unbalanced),/UNBALANCED_ENTRY/);
});

test('LISTADO reports explicitly blank zero entries while reserving their original numbers',()=>{
 const pages=listadoPages(undefined,{emptyEntry:true}),source=parseJournalPages(pages);
 assert.equal(source.totals.entries,3);assert.equal(source.totals.lines,6);assert.equal(source.totals.ignored_empty_lines,2);
 assert.equal(source.totals.ignored_empty_entries,1);
 assert.deepEqual(source.ignored_entries,[{number:2026000043,entry_date:'2026-01-04',source_page:2}]);
 const missing=structuredClone(pages);missing[1].items=missing[1].items.filter(item=>!(item.y>=492&&item.y<=496));
 assert.throws(()=>parseJournalPages(missing),/INVALID_ENTRY/);
 const nonzero=structuredClone(pages);nonzero[1].items.find(item=>item.x===455&&item.y===494).text='1,00';
 assert.throws(()=>parseJournalPages(nonzero),/UNREAD_ROW/);
 const duplicate=structuredClone(pages);
 duplicate[1].items.push(...duplicate[1].items.filter(item=>item.y>=472&&item.y<=515).map(item=>({...item,y:item.y-80})));
 assert.throws(()=>parseJournalPages(duplicate),/DUPLICATE_NUMBER/);
});

test('provided LISTADO journal reconciles every entry and the printed final total',{skip:!process.env.TEST_LISTADO_JOURNAL_PDF},async()=>{
 const source=await extractJournalPdf(readFileSync(process.env.TEST_LISTADO_JOURNAL_PDF));
 assert.equal(source.pages,144);assert.equal(source.totals.entries,1989);assert.equal(source.totals.lines,6472);assert.equal(source.totals.accounts,419);
 assert.equal(source.totals.debit,'15185874.20');assert.equal(source.totals.credit,'15185874.20');assert.equal(source.totals.ignored_empty_lines,9);
 assert.equal(source.subaccount_length,10);assert.equal(source.has_closing,false);
});

test('provided 2023 LISTADO preserves the single zero remittance and identifies the empty entry',{skip:!process.env.TEST_LISTADO_JOURNAL_2023_PDF},async()=>{
 const source=await extractJournalPdf(readFileSync(process.env.TEST_LISTADO_JOURNAL_2023_PDF));
 assert.equal(source.pages,253);assert.equal(source.subaccount_length,10);
 assert.equal(source.totals.entries,3741);assert.equal(source.totals.lines,10839);assert.equal(source.totals.accounts,551);
 assert.equal(source.totals.debit,'20703639.50');assert.equal(source.totals.credit,'20703639.50');
 assert.equal(source.totals.zero_lines,101);assert.equal(source.totals.ignored_empty_lines,34);
 assert.deepEqual(source.ignored_entries,[{number:2023001486,entry_date:'2023-05-31',source_page:100}]);
 const zero=source.entries.find(entry=>entry.number===2023000709);
 assert.equal(zero.lines.length,1);assert.equal(zero.lines[0].code,'5720000036');assert.equal(zero.lines[0].page,50);
 assert.equal(zero.lines[0].debit,'0.00');assert.equal(zero.lines[0].credit,'0.00');assert.equal(source.has_closing,true);
});

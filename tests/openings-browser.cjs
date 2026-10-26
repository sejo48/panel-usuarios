const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const firestore = `
 export const getFirestore=()=>({});
 export const collection=(_,name)=>({name});
 export const query=(ref,...filters)=>({...ref,filters});
 export const where=(...args)=>args;
 export const doc=()=>({});
 export const setDoc=exportWrite,updateDoc=exportWrite,deleteDoc=exportWrite;
 function exportWrite(){throw Error('Unexpected write');}
 export const getDoc=()=>Promise.resolve({exists:()=>false});
 export async function getDocs(){return {forEach(fn){for(const email of ['a@example.com','b@example.com','c@example.com'])fn({id:email,data:()=>({status:'active',expires_at:'2028-01-01',devices:[]})});}};}
 export function onSnapshot(ref,callback,error){
   window.__listeners ||= {}; window.__listeners[ref.name]={callback,error,ref};
   queueMicrotask(()=>callback({docs:ref.name==='aperturas'?[
     {data:()=>({email:'a@example.com',day:'2026-10-26'})},
     {data:()=>({email:'a@example.com',day:'2026-10-26'})},
     {data:()=>({email:'a@example.com',day:'2026-10-25'})},
     {data:()=>({email:'b@example.com',day:'2026-10-26'})}
   ]:[]}));
   return ()=>{};
 }
`;
(async()=>{
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.addInitScript(()=>{
   sessionStorage.setItem('boxplay_admin_logged','true');
   const RealDate=Date; window.__now=RealDate.parse('2026-10-26T18:00:00Z');
   window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};
   window.__timers=[]; window.setInterval=(fn)=>{window.__timers.push(fn);return 1;};
  });
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.host==='www.gstatic.com')return route.fulfill({contentType:'application/javascript',body:url.pathname.includes('firebase-app')?'export const initializeApp=()=>({});':firestore});
   if(url.host==='panel.test'){
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(['index.html','opening-stats.js'].includes(name))return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(path.join(root,name))});
   }
   return route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://panel.test/');
  await page.getByRole('button',{name:'Usuarios',exact:true}).click();
  await page.locator('.subscriber-row').first().waitFor();
  const row=email=>page.locator('.subscriber-row').filter({has:page.locator('.subscriber-email',{hasText:email})});
  await page.waitForFunction(()=>document.querySelector('.opening-counts')?.textContent.includes('Mes: 3'));
  assert.match(await row('a@example.com').innerText(),/Hoy: 2/);
  assert.match(await row('b@example.com').innerText(),/Mes: 1/);
  assert.match(await row('c@example.com').innerText(),/Mes: 0/);
  await row('a@example.com').getByText('Ver por día').click();
  assert.match(await row('a@example.com').innerText(),/25\/10: 1/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV'}).click();
  const download=await downloadPromise;
  const csv=fs.readFileSync(await download.path(),'utf8');
  assert.match(csv,/Aperturas_Hoy,Aperturas_Mes/);assert.match(csv,/a@example.com[^\n]*,2,3/);
  await page.evaluate(()=>{window.__now=Date.parse('2026-10-27T06:00:00Z');window.__timers.forEach(fn=>fn());});
  assert.match(await row('a@example.com').innerText(),/Hoy: 0/);
  await page.evaluate(()=>window.__listeners.aperturas.error(Error('permission-denied')));
  assert.match(await row('a@example.com').innerText(),/Sin información/);
  await page.evaluate(()=>{window.__now=Date.parse('2026-11-01T06:00:00Z');window.__timers.forEach(fn=>fn());});
  await page.waitForFunction(()=>window.__listeners.aperturas.ref.filters[0][2]==='2026-11-01');
  assert.match(await row('a@example.com').innerText(),/Mes: 0/);
  assert.deepEqual(errors,[]);
  console.log('PASS: per-user counts, daily details, CSV, mobile, midnight/month rollover, permissions error; no production requests.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

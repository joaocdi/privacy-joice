require('./sqlite-env');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
process.env.DATABASE_URL='';
process.env.DATABASE_PATH=path.join(__dirname,'../.test-runs/burst-'+crypto.randomUUID()+'.sqlite');
process.env.PAYMENT_PROVIDER='mock';
process.env.BUYER_ACCOUNT_FLOW='true';
process.env.VERCEL='1';
process.env.WHATSAPP_NUMBER='5511999990000';
const {app}=require('../server');
const db=require('../db/database');
const {confirmPayment}=require('../services/entitlements');
let server;
(async()=>{
 await db.initDb();
 server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const started=Date.now(),orderIds=[];
 const total=Number(process.env.BURST_TOTAL||200),wave=Number(process.env.BURST_CONCURRENCY||5);
 // Compradores independentes em ondas, sem API de pagamento real.
 for(let offset=0;offset<total;offset+=wave){
  const results=await Promise.all(Array.from({length:Math.min(wave,total-offset)},async(_,n)=>{
   const i=offset+n;
   const response=await fetch(base+'/api/payments/pix',{method:'POST',
    headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.'+Math.floor(i/250)+'.'+(i%250+1)},
    body:JSON.stringify({productId:'monthly',checkoutToken:crypto.randomBytes(32).toString('hex')})});
   return {status:response.status,body:await response.json()};
  }));
  assert(results.every(result=>result.status===201),JSON.stringify(results.filter(r=>r.status!==201)));
  orderIds.push(...results.map(r=>r.body.orderId));
 }
 assert.equal(new Set(orderIds).size,total);
 for(let offset=0;offset<total;offset+=wave)
  await Promise.all(orderIds.slice(offset,offset+wave).map(id=>confirmPayment(id)));
 const database=await db.getDb();
 assert.equal((await database.get("SELECT COUNT(*) n FROM orders WHERE status='PAID'")).n,total);
 assert.equal((await database.get('SELECT COUNT(*) n FROM entitlements')).n,0,
  'Compra com cadastro obrigatório não libera conteúdo sem vínculo');
 await Promise.all(Array.from({length:10},()=>confirmPayment(orderIds[0])));
 assert.equal((await database.get("SELECT COUNT(*) n FROM orders WHERE status='PAID'")).n,total);
 console.log('PASS: '+total+' pedidos e confirmações simulados, '+wave+' simultâneos, IDs únicos, webhook idempotente em '+(Date.now()-started)+'ms');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await db.closeDb();
});

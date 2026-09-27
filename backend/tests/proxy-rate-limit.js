require('./sqlite-env');
const assert=require('node:assert/strict');
process.env.VERCEL='1';
process.env.PAYMENT_PROVIDER='mock';
const {app}=require('../server');
let server;
(async()=>{
 server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function attempt(ip){
  const response=await fetch(base+'/api/payments/pix',{method:'POST',
   headers:{'Content-Type':'application/json','X-Forwarded-For':ip},
   body:JSON.stringify({productId:'invalid'})});
  return response.status;
 }
 // Uma tentativa inválida por visitante passa pelo limitador e recebe 404;
 // nunca cria pedido nem contata o gateway.
 const different=await Promise.all(Array.from({length:200},(_,i)=>attempt('198.51.100.'+(i+1))));
 assert(different.every(status=>status===404),JSON.stringify(different));
 const same=await Promise.all(Array.from({length:11},()=>attempt('203.0.113.9')));
 assert.equal(same.filter(status=>status===429).length,1);
 assert.equal(same.filter(status=>status===404).length,10);
 console.log('PASS: proxy separa compradores e limita repetição do mesmo IP');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

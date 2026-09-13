require('./sqlite-env');
const assert=require('node:assert/strict'),crypto=require('crypto'),path=require('path');
process.env.DATABASE_PATH=path.resolve(__dirname,'../.test-runs/buyer-browser-'+crypto.randomUUID()+'.sqlite');
process.env.PAYMENT_PROVIDER='mock';process.env.FRONTEND_URL='';process.env.VIP_MEDIA_SECRET=crypto.randomBytes(32).toString('hex');
const provider=require('../payments/mock-provider'),original=provider.createPixPayment;const payments=new Map();
provider.createPixPayment=async data=>{const payment=await original(data);payments.set(data.orderId,payment);return payment;};
const {app}=require('../server'),database=require('../db/database');
const {chromium}=require('../.test-runs/browser/node_modules/playwright');let server,browser;
async function main(){
 await database.initDb();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,db=await database.getDb();
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const width of [320,375,390,430]){
  const context=await browser.newContext({viewport:{width,height:850},hasTouch:true,permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
  await page.goto(base+'/');await page.evaluate(()=>openCheckout('monthly'));
  const phone=page.locator('#checkoutClientForm input[name="phone"]');await phone.waitFor({state:'visible'});
  assert.equal(await page.locator('#checkoutClientForm input:enabled').count(),1);
  await phone.fill('11999990000');assert.equal(await phone.inputValue(),'(11) 99999-0000');
  await page.locator('#checkoutClientForm button').tap();await page.waitForSelector('#pixActiveArea',{state:'visible'});
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('joice.buyer.pending')));
  const order=await db.get('SELECT * FROM orders WHERE public_id=?',pending.payment.orderId);
  assert.equal(order.customer_phone,'5511999990000');assert.equal(order.customer_email,null);assert.equal(order.customer_document_hash,null);
  const auth={Authorization:'Bearer '+pending.token};
  const vip=()=>context.request.get(base+'/api/vip/'+order.public_id,{headers:auth});
  assert.equal((await vip()).status(),403);
  await db.run("UPDATE orders SET status='FAILED' WHERE id=?",order.id);assert.equal((await vip()).status(),403);
  await db.run("UPDATE orders SET status='PAID' WHERE id=?",order.id);assert.equal((await vip()).status(),403);
  await db.run("UPDATE orders SET status='PENDING' WHERE id=?",order.id);
  await page.reload();await page.waitForSelector('#pixActiveArea',{state:'visible'});
  assert.equal(await phone.isVisible(),false,'refresh resumes without another phone prompt');
  const qr=page.locator('#pixQrImage');await qr.evaluate(img=>img.decode());assert.ok((await qr.boundingBox()).width>=180);
  const copy=page.locator('#btnCopyPix');assert.ok((await copy.boundingBox()).height>=44);
  await copy.tap();await page.waitForFunction(()=>document.getElementById('btnCopyPix').textContent.includes('Copiado'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.resolve(__dirname,'../.test-runs/buyer-pix-'+width+'.png')});
  const payment=payments.get(order.public_id);const paid=await context.request.post(base+'/api/payments/webhook',{data:{token:payment.webhookToken,transactionId:payment.providerPaymentId,event:'TRANSACTION_PAID'}});assert.equal(paid.status(),200);
  await page.waitForSelector('#pixSuccessNotification',{state:'visible'});assert.equal((await vip()).status(),200);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('joice.vip.access')));assert.equal(saved.orderId,order.public_id);
  await page.reload();await page.locator('[data-buyer-access]').first().tap();await page.waitForURL('**/vip');await page.waitForSelector('#vipContent',{state:'visible'});
  await page.reload();await page.waitForSelector('#vipContent',{state:'visible'});
  const stranger=await browser.newContext({viewport:{width,height:850}});const other=await stranger.newPage();await other.goto(base+'/vip');await other.waitForSelector('#vipBlocked',{state:'visible'});
  assert.equal((await stranger.request.get(base+'/api/vip/'+order.public_id+'?phone=11999990000')).status(),403);
  await other.goto(base+'/?recover=1');await other.locator('#buyerRecoveryPhone input').fill('11999990000');await other.locator('#buyerRecoveryPhone button').click();
  await other.waitForFunction(()=>document.getElementById('buyerRecoveryStatus').textContent.includes('indisponível'));
  assert.equal(await other.locator('#buyerRecoveryCode').isVisible(),false);
  assert.ok(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await db.run("UPDATE entitlements SET status='EXPIRED' WHERE order_id=?",order.id);assert.equal((await vip()).status(),403);
  console.log('PASS buyer mobile '+width+': phone-only mock, QR/copy, pending/failed/no-grant denied, webhook approval, refresh/same-browser, stranger/phone denied, expiry, honest unavailable recovery');
  await stranger.close();await context.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await database.closeDb();});


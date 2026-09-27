// Regressão: o HTML de /meu-acesso e /login não contém telefone.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../../buyer-account.js'),'utf8');

function element(tag='div'){
 return {tag,hidden:false,disabled:false,value:'',textContent:'',children:[],
  append(...items){this.children.push(...items);},
  replaceChildren(){this.children=[];},
  querySelector(){return null;}};
}

async function run(route){
 const nodes=new Map(),events={};
 const get=id=>nodes.get(id)||nodes.set(id,element()).get(id);
 const phone=route==='/criar-acesso'?element('input'):null;
 if(phone)phone.addEventListener=(name,handler)=>{events[name]=handler;};
 const pending={token:'a'.repeat(64),payment:{orderId:'ord_'+ 'b'.repeat(48)}};
 const location={pathname:route,search:'',hash:'',replace(url){this.destination=url;},assign(url){this.destination=url;}};
 const document={
  getElementById:get,
  querySelector:selector=>selector==='[name="phone"]'?phone:null,
  querySelectorAll:()=>[],
  createElement:element
 };
 const fetch=async url=>{
  if(url==='/api/catalog')return {ok:true,json:async()=>({accountFlow:true,products:[{id:'monthly',name:'Mensal'}]})};
  if(url==='/api/buyer/account')return route==='/criar-acesso'?{ok:false,status:401}:{ok:true,status:200,json:async()=>({email:'comprador@example.test',orders:[{product_id:'monthly',status:'ACTIVE',grant_type:'subscription',public_id:'ord_test',expires_at:null}]})};
  if(url.includes('/status'))return {ok:true,json:async()=>({status:'PAID',needsClaim:true})};
  throw Error('Requisição inesperada: '+url);
 };
 get('passwordLabel').querySelector=()=>element('input');
 get('phoneLabel').querySelector=()=>phone||element('input');
 get('confirmLabel').querySelector=()=>element('input');
 vm.runInNewContext(script,{document,location,history:{replaceState(){}},URLSearchParams,AbortSignal,JoiceCheckouts:{selected:()=>pending,list:()=>[]},fetch,FormData,console});
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 return {get,phone,events,location};
}

(async()=>{
 const dashboard=await run('/meu-acesso');
 assert.equal(dashboard.get('title').textContent,'Seu acesso, sempre aqui');
 const card=dashboard.get('orders').children[0];
 const vipButton=card.children.find(child=>child.tag==='button');
 assert.equal(vipButton.textContent,'Entrar no VIP');
 await vipButton.onclick();
 assert.equal(dashboard.location.destination,'/vip');
 const signup=await run('/criar-acesso');
 assert.equal(signup.get('title').textContent,'Pagamento confirmado — crie seu acesso');
 signup.phone.value='47';signup.events.input({inputType:'insertText'});
 assert.equal(signup.phone.value,'(47) ');
 signup.phone.value='(47)';signup.events.input({inputType:'deleteContentBackward'});
 assert.equal(signup.phone.value,'(47');
 signup.phone.value='(4';signup.events.input({inputType:'deleteContentBackward'});
 assert.equal(signup.phone.value,'(4');
 signup.phone.value='';signup.events.input({inputType:'deleteContentBackward'});
 assert.equal(signup.phone.value,'');
 console.log('PASS: painel pago renderiza VIP sem telefone; DDD pode ser apagado');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Development-only EIP-1193 adapter for disposable local Ganache accounts.
// e2e.html is not an input to the production Vite build.
if (!import.meta.env.DEV || import.meta.env.VITE_E2E !== '1' || location.hostname !== '127.0.0.1') {
  throw new Error('Wallet harness is available only in explicit local QA mode.');
}
const endpoint='http://127.0.0.1:8545';let sequence=0;
async function rpc(method:string,params:unknown[]=[]){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});
 const body=await response.json();if(body.error)throw Object.assign(new Error(body.error.message),body.error);return body.result;
}
const accounts:string[]=await rpc('eth_accounts');
if(await rpc('eth_chainId')!=='0xa869')throw Error('Local QA node must use chain ID 43113.');
let selected=0;let rejectNext=false;
const listeners=new Map<string,Set<(...args:any[])=>void>>();
function emit(event:string,payload:unknown){listeners.get(event)?.forEach(fn=>fn(payload))}
const provider={
 on(event:string,fn:(...args:any[])=>void){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn)},
 removeListener(event:string,fn:(...args:any[])=>void){listeners.get(event)?.delete(fn)},
 async request({method,params=[]}:{method:string,params?:unknown[]}){
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [accounts[selected]];
  if(method==='wallet_switchEthereumChain'){if((params[0] as any)?.chainId!=='0xa869')throw Error('Local QA supports only 43113');emit('chainChanged','0xa869');return null;}
  if(method==='wallet_requestPermissions')return [{parentCapability:'eth_accounts'}];
  if(method==='wallet_revokePermissions')return null;
  // Some viem versions probe the wallet RPC namespace before eth_sendTransaction.
  if(method==='wallet_sendTransaction')method='eth_sendTransaction';
  if(method==='eth_sendTransaction'&&rejectNext){rejectNext=false;status.textContent='Next transaction rejected by test wallet.';throw Object.assign(new Error('User rejected the request.'),{code:4001});}
  if(method==='eth_sendTransaction'){
   const tx=params[0] as {from?:string;gas?:string};if(tx.from?.toLowerCase()!==accounts[selected].toLowerCase())throw Error('Transaction account does not match the selected test wallet');
   // An extension wallet estimates gas before submitting; Ganache's unlocked
   // account RPC does not, so emulate that wallet behavior here.
   if(!tx.gas)tx.gas='0x'+(BigInt(await rpc('eth_estimateGas',[tx]))*12n/10n).toString(16);
  }
  try{return await rpc(method,params)}catch(error){status.textContent=`QA RPC ${method}: ${(error as Error).message}`;throw error;}
 }
};
Object.defineProperty(window,'ethereum',{value:provider,configurable:true});
const panel=document.createElement('div');panel.setAttribute('aria-label','Local QA wallet controls');
panel.style.cssText='position:sticky;top:0;z-index:10000;background:#472754;color:white;padding:10px 14px;font:12px Arial;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:2px solid #dfadff';
const label=document.createElement('strong');label.textContent='LOCAL QA • NO REAL FUNDS';panel.append(label);
const select=document.createElement('select');select.setAttribute('aria-label','Active test wallet');select.style.cssText='background:#211228;color:white;padding:5px';
accounts.slice(0,5).forEach((a,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Wallet ${i+1} · ${a.slice(0,8)}`;select.append(option)});
select.onchange=()=>{selected=Number(select.value);emit('accountsChanged',[accounts[selected]]);status.textContent=`Active: ${accounts[selected]}`};panel.append(select);
const reject=document.createElement('button');reject.textContent='Reject next transaction';reject.onclick=()=>{rejectNext=true;status.textContent='Next transaction will be rejected.'};panel.append(reject);
const advance=document.createElement('button');advance.textContent='Advance 40 seconds';advance.onclick=async()=>{await rpc('evm_increaseTime',[40]);await rpc('evm_mine');status.textContent='Advanced local chain by 40 seconds. Reads refresh within 5s.'};panel.append(advance);
const status=document.createElement('span');status.setAttribute('role','status');status.textContent='Disposable local wallets only.';panel.append(status);
document.body.prepend(panel);
await import('../src/main');
export {};

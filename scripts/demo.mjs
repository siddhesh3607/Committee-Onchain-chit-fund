// Local accelerated demo by default. --fuji uses five funded testnet keys from environment.
import ganache from 'ganache';
import {BrowserProvider,JsonRpcProvider,Wallet,ContractFactory,Contract,parseEther,keccak256,toUtf8Bytes} from 'ethers';
import {readFileSync} from 'node:fs';
const fuji=process.argv.includes('--fuji');
const rpc=fuji?null:ganache.provider({logging:{quiet:true},chain:{chainId:31337},wallet:{totalAccounts:5},miner:{timestampIncrement:0}});
const provider=fuji?new JsonRpcProvider(process.env.FUJI_RPC_URL||'https://api.avax-test.network/ext/bc/C/rpc',43113,{cacheTimeout:-1}):new BrowserProvider(rpc,undefined,{cacheTimeout:-1});
provider.pollingInterval=1000;
let wallets;
if(fuji){
 if(Number((await provider.getNetwork()).chainId)!==43113)throw Error('Fuji only');
 const keys=(process.env.DEMO_PRIVATE_KEYS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(keys.length!==5)throw Error('Set DEMO_PRIVATE_KEYS to five comma-separated, funded, testnet-only private keys in your process environment.');
 wallets=keys.map(k=>new Wallet(k,provider));
 if(new Set(wallets.map(w=>w.address.toLowerCase())).size!==5)throw Error('Five distinct wallets required');
 for(const w of wallets)if(await provider.getBalance(w.address)<parseEther('0.09'))throw Error(`Fund ${w.address} with at least 0.09 test AVAX (first wallet may need more gas).`);
}else wallets=await Promise.all(Array.from({length:5},(_,i)=>provider.getSigner(i)));
const factoryArtifact=JSON.parse(readFileSync('artifacts/ChitFactory.json'));const chitArtifact=JSON.parse(readFileSync('artifacts/Chit.json'));
const factory=await new ContractFactory(factoryArtifact.abi,factoryArtifact.bytecode,wallets[0]).deploy();await factory.waitForDeployment();console.log('Factory:',await factory.getAddress());
await(await factory.createChit('Five friends · live demo',5,parseEther('0.01'),120,500)).wait();const address=await factory.chits(0);const chit=new Contract(address,chitArtifact.abi,wallets[0]);console.log('Circle:',address);if(fuji)console.log('Open the app with ?chit='+address);else console.log('Local simulation only; the dashboard connects to Fuji.');
const send=async(i,fn,...args)=>(await chit.connect(wallets[i])[fn](...args)).wait();
for(let i=0;i<5;i++)await send(i,'join',{value:parseEther('0.05')});await send(0,'start');
async function until(timestamp){
 if(!fuji){const now=(await provider.getBlock('latest')).timestamp;await rpc.request({method:'evm_increaseTime',params:[Math.max(0,timestamp-now)]});await rpc.request({method:'evm_mine',params:[]});return}
 while((await provider.getBlock('latest')).timestamp<timestamp)await new Promise(r=>setTimeout(r,1000));
}
const rounds=fuji?Number(process.env.DEMO_ROUNDS||3):5;
if(!Number.isInteger(rounds)||rounds<1||rounds>5)throw Error('DEMO_ROUNDS must be 1–5');
for(let r=1;r<=rounds;r++){
 const start=Number(await chit.roundStart());
 for(let i=0;i<5;i++){if(r===2&&i===4)continue;const due=await chit.due(await wallets[i].getAddress());console.log(`Round ${r}, member ${i+1}, due ${due} wei`);await send(i,'contribute',{value:due})}
 await until(start+40);const winner=r-1;const discount=parseEther('0.01');const salt=keccak256(toUtf8Bytes(`local-demo-${address}-${r}`));
 // Demo salts are intentionally public. The app uses cryptographically random private salts.
 await send(winner,'commitBid',await chit.commitmentFor(await wallets[winner].getAddress(),discount,salt));await until(start+80);await send(winner,'revealBid',discount,salt);await until(start+120);await send(0,'settle');
 const result=await chit.rounds(r);console.log(`Round ${r}: winner ${result.winner}, discount ${result.discount}, dividend ${result.dividend}, slashed ${result.slashed}`);
}
if(rounds===5){for(let i=0;i<5;i++)await send(i,'withdraw',await wallets[i].getAddress());console.log('Five rounds complete. All balances withdrawn.');}else console.log('Demo complete. Two rounds remain: finish them in the UI to unlock collateral.');
if(rpc)await rpc.disconnect();provider.destroy();

import {test} from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,parseEther,keccak256,toUtf8Bytes,ZeroHash} from 'ethers';
import {readFileSync} from 'node:fs';
import '../scripts/compile.mjs';
import {makeSimulation,advanceSimulation} from '../src/mechanism.mjs';
const artifact=JSON.parse(readFileSync('artifacts/ChitFactory.json'));
const chitArtifact=JSON.parse(readFileSync('artifacts/Chit.json'));
const C=parseEther('0.01');
async function setup(n=5){
 const rpc=ganache.provider({logging:{quiet:true},chain:{chainId:43113,hardfork:'shanghai'},wallet:{totalAccounts:8},miner:{timestampIncrement:0}});
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all(Array.from({length:8},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const factory=await new ContractFactory(artifact.abi,artifact.bytecode,signers[0]).deploy();await factory.waitForDeployment();
 await(await factory.createChit('Test circle',n,C,120,500)).wait();
 const chit=new Contract(await factory.chits(0),chitArtifact.abi,signers[0]);
 const send=async(i,fn,...args)=>(await chit.connect(signers[i])[fn](...args)).wait();
 const advance=async seconds=>{await rpc.request({method:'evm_increaseTime',params:[seconds]});await rpc.request({method:'evm_mine',params:[]})};
 const join=async()=>{for(let i=0;i<n;i++)await send(i,'join',{value:C*BigInt(n)});await send(0,'start')};
 const contribute=async skip=>{for(let i=0;i<n;i++)if(i!==skip)await send(i,'contribute',{value:await chit.due(addresses[i])})};
 const bid=async(i,d)=>{const salt=keccak256(toUtf8Bytes(`round-${await chit.currentRound()}-member-${i}`));const hash=await chit.commitmentFor(addresses[i],d,salt);await send(i,'commitBid',hash);return salt};
 const invariant=async()=>{let liabilities=0n;for(let i=0;i<8;i++){const s=await chit.standing(addresses[i]);liabilities+=s.collateral+s.credit+await chit.claimable(addresses[i])}const balance=BigInt(await rpc.request({method:'eth_getBalance',params:[await chit.getAddress(),'latest']}));assert.equal(balance,liabilities,'all wei accounted for after settlement')};
 return {rpc,provider,signers,addresses,factory,chit,send,advance,join,contribute,bid,invariant,close:()=>rpc.disconnect()};
}
test('five wallets: full lifecycle, round 2 slash, round 3 reduced dues, all funds withdraw',async()=>{
 const x=await setup();try{await x.join();
 for(let r=1;r<=5;r++){
 assert.equal(await x.chit.currentRound(),BigInt(r));
 if(r===3) assert.ok(await x.chit.due(x.addresses[2])<C,'dividend lowers round 3 contribution');
 await x.contribute(r===2?4:undefined);await x.advance(40);
 const winner=r-1;const discount=r<=3?parseEther('0.01'):0n;
 let salt;if(r<=3)salt=await x.bid(winner,discount);
 await x.advance(40);if(salt)await x.send(winner,'revealBid',discount,salt);
 await x.advance(40);await x.send(7,'settle');
 const round=await x.chit.rounds(r);assert.equal(round.winner,x.addresses[winner]);
 if(r===2){assert.ok(round.slashed>0n);assert.ok((await x.chit.standing(x.addresses[4])).collateral<C*5n)}
 assert.equal(round.discount,discount);await x.invariant();
 }
 assert.equal(await x.chit.completed(),true);assert.equal(await x.chit.phase(),5n);
 for(let i=0;i<5;i++)await x.send(i,'withdraw',x.addresses[i]);
 const balance=await x.rpc.request({method:'eth_getBalance',params:[await x.chit.getAddress(),'latest']});assert.equal(BigInt(balance),0n);
 await assert.rejects(()=>x.send(0,'settle'));await assert.rejects(()=>x.send(0,'withdraw',x.addresses[0]));
 }finally{await x.close()}
});
test('highest discount wins; tied bids prefer original join order; invalid reveals fail',async()=>{
 const x=await setup(3);try{await x.join();await x.contribute();await assert.rejects(()=>x.bid(0,1n));await x.advance(40);
 const d=parseEther('0.005');const s1=await x.bid(1,d);const s0=await x.bid(0,d);const s2=await x.bid(2,d-1n);
 await assert.rejects(()=>x.bid(0,d));await x.advance(40);
 await assert.rejects(()=>x.send(0,'revealBid',d,ZeroHash));await x.send(1,'revealBid',d,s1);await x.send(2,'revealBid',d-1n,s2);await x.send(0,'revealBid',d,s0);await assert.rejects(()=>x.send(0,'revealBid',d,s0));
 await x.advance(40);await x.send(4,'settle');assert.equal((await x.chit.rounds(1)).winner,x.addresses[0]);await x.invariant();
 await x.contribute();await x.advance(40);await assert.rejects(()=>x.bid(0,1n));
 }finally{await x.close()}
});
test('non-reveal fallback and repeated defaults preserve solvency through every round',async()=>{
 const x=await setup(3);try{await x.join();for(let r=1;r<=3;r++){await x.advance(120);await x.send(7,'settle');const result=await x.chit.rounds(r);assert.equal(result.winner,x.addresses[r-1]);assert.equal(result.slashed,C*3n);await x.invariant()}for(let i=0;i<3;i++){assert.equal((await x.chit.standing(x.addresses[i])).collateral,0n);await x.send(i,'withdraw',x.addresses[i]);}await x.invariant();}finally{await x.close()}
});
test('exact amounts, members-only actions, early settlement and collateral withdrawal are enforced',async()=>{
 const x=await setup(2);try{
 await assert.rejects(()=>x.send(0,'join',{value:C}));await x.join();
 await assert.rejects(()=>x.send(0,'join',{value:C*2n}));await assert.rejects(()=>x.send(7,'contribute',{value:C}));
 await assert.rejects(()=>x.send(0,'contribute',{value:C+1n}));await assert.rejects(()=>x.send(0,'withdraw',x.addresses[0]));
 await x.send(0,'contribute',{value:C});await assert.rejects(()=>x.send(0,'contribute',{value:C}));
 await assert.rejects(()=>x.send(0,'settle'));await x.advance(40);await assert.rejects(()=>x.send(1,'contribute',{value:C}));await assert.rejects(()=>x.bid(1,1n));
 }finally{await x.close()}
});
test('expired enrollment can be cancelled permissionlessly with full refunds',async()=>{
 const x=await setup(3);try{await x.send(0,'join',{value:C*3n});await assert.rejects(()=>x.send(1,'start'));await assert.rejects(()=>x.send(7,'cancel'));await x.advance(86400);await x.send(7,'cancel');assert.equal(await x.chit.phase(),6n);await x.send(0,'withdraw',x.addresses[6]);assert.equal((await x.chit.standing(x.addresses[0])).collateral,0n);await assert.rejects(()=>x.send(1,'join',{value:C*3n}));await x.invariant();}finally{await x.close()}
});
test('commitments are bound to member, contract and round; pot-sized discount is rejected',async()=>{
 const x=await setup(2);try{await x.join();await x.contribute();await x.advance(40);const pot=await x.chit.pot();const salt=await x.bid(0,pot);await x.send(1,'commitBid',await x.chit.commitmentFor(x.addresses[0],pot,salt));await x.advance(40);await assert.rejects(()=>x.send(0,'revealBid',pot,salt));await assert.rejects(()=>x.send(1,'revealBid',pot-1n,salt));await x.advance(40);await x.send(7,'settle');assert.equal((await x.chit.rounds(1)).discount,0n);await x.invariant();}finally{await x.close()}
});
test('rounding dust is credited to foreman and total liabilities match balance',async()=>{
 const x=await setup(3);try{await x.join();await x.contribute();await x.advance(40);const salt=await x.bid(1,23n);await x.advance(40);await x.send(1,'revealBid',23n,salt);await x.advance(40);await x.send(7,'settle');const r=await x.chit.rounds(1);assert.equal(r.dividend,11n);assert.equal(r.commission,1n);await x.invariant();await x.send(1,'withdraw',x.addresses[6]);await x.invariant();}finally{await x.close()}
});
test('failed recipient transfer rolls back withdrawal and never blocks settlement',async()=>{
 const x=await setup(2);try{await x.join();await x.advance(120);await x.send(7,'settle');const prize=await x.chit.claimable(x.addresses[0]);await assert.rejects(()=>x.send(0,'withdraw',x.factory.target));assert.equal(await x.chit.claimable(x.addresses[0]),prize);await x.send(0,'withdraw',x.addresses[6]);assert.equal(await x.chit.claimable(x.addresses[0]),0n);await x.advance(120);await x.send(7,'settle');await x.invariant();}finally{await x.close()}
});
test('large dividends carry forward and a zero-due member must still contribute to bid',async()=>{
 const x=await setup(2);try{await x.join();await x.contribute();await x.advance(40);const d=parseEther('0.019');const salt=await x.bid(0,d);await x.advance(40);await x.send(0,'revealBid',d,salt);await x.advance(40);await x.send(7,'settle');assert.equal(await x.chit.due(x.addresses[1]),0n);assert.ok((await x.chit.standing(x.addresses[1])).credit>C);await x.send(1,'contribute',{value:0n});await x.advance(40);await x.bid(1,0n);await x.advance(80);await x.send(7,'settle');await x.invariant();assert.equal(await x.chit.completed(),true);}finally{await x.close()}
});
test('factory rejects invalid terms and records creator as foreman',async()=>{
 const x=await setup(2);try{assert.equal(await x.chit.foreman(),x.addresses[0]);assert.equal(await x.factory.chitCount(),1n);for(const args of [['',2,C,120,500],['x',1,C,120,500],['x',33,C,120,500],['x',2,0n,120,500],['x',2,C,29,500],['x',2,C,120,1001]])await assert.rejects(async()=>{await(await x.factory.createChit(...args)).wait()});}finally{await x.close()}
});
test('interactive arena matches deployed Solidity balances for five rounds including default',async()=>{
 const x=await setup();let state=makeSimulation();try{await x.join();for(let r=1;r<=5;r++){
  state=advanceSimulation(state,{missRoundTwo:true});await x.contribute(r===2?4:undefined);await x.advance(40);
  state=advanceSimulation(state,{missRoundTwo:true});const salts=[];
  for(const m of state.members)if(m.committed)salts[m.id]=await x.bid(m.id,m.bid);
  state=advanceSimulation(state);await x.advance(40);
  for(const m of state.members)if(m.revealed)await x.send(m.id,'revealBid',m.bid,salts[m.id]);
  state=advanceSimulation(state);await x.advance(40);await x.send(7,'settle');
  const result=await x.chit.rounds(r),sim=state.history.at(-1);
  assert.equal(result.winner,x.addresses[sim.winner]);assert.equal(result.discount,sim.discount);assert.equal(result.dividend,sim.dividend);assert.equal(result.slashed,sim.slashed);
  for(const m of state.members){const actual=await x.chit.standing(x.addresses[m.id]);assert.equal(actual.collateral,m.collateral);assert.equal(actual.credit,m.credit);assert.equal(actual.won,m.won);assert.equal(await x.chit.claimable(x.addresses[m.id]),m.prize+(m.id===0?state.commission:0n));}
  state=advanceSimulation(state);
 }}finally{await x.close()}
});

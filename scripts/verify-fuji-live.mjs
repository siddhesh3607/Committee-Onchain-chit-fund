// Read-only, independent verification of every recorded public Fuji receipt.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JsonRpcProvider,Contract,Interface,parseEther,formatEther} from 'ethers';
const file=name=>new URL(`../deployments/${name}`,import.meta.url);
const state=JSON.parse(fs.readFileSync(file('fuji-live-test-results-retry.json'))),prior=JSON.parse(fs.readFileSync(file('fuji-live-test-results.json'))),plan=JSON.parse(fs.readFileSync(file('fuji-live-test-plan.json')));
assert.equal(state.status,'completed-with-failures');
assert.deepEqual(state.failures,['round 1: reverse auction discount matches reveal','round 1: exact dividend credit','round 2 missed payment slashed exactly 0.0007625 AVAX']);
assert.equal(prior.status,'completed-with-failures');
assert.deepEqual(prior.failures,['round 4: reverse auction discount matches reveal','round 4: exact dividend credit']);
const provider=new JsonRpcProvider('https://avalanche-fuji-c-chain-rpc.publicnode.com',43113,{cacheTimeout:-1,staticNetwork:true});
const originalSend=provider.send.bind(provider);
provider.send=async(method,params)=>{for(let attempt=0;;attempt++){try{return await originalSend(method,params)}catch(error){if(attempt>=6)throw error;console.log(`Retrying public read ${method}`);await new Promise(r=>setTimeout(r,750+attempt*250))}}};
assert.equal(BigInt(await provider.send('eth_chainId',[])),43113n);
const artifact=n=>JSON.parse(fs.readFileSync(new URL(`../artifacts/${n}.json`,import.meta.url)));
const deployment=JSON.parse(fs.readFileSync(file('fuji-live-deployment.json')));
const [deploymentReceipt,deploymentTransaction]=await Promise.all([provider.getTransactionReceipt(deployment.transactionHash),provider.getTransaction(deployment.transactionHash)]);
assert.equal(deploymentReceipt.status,1);assert.equal(deploymentTransaction.chainId,43113n);
assert.equal(deploymentTransaction.data,artifact('ChitFactory').bytecode);
assert.equal(deploymentReceipt.contractAddress.toLowerCase(),plan.factory.toLowerCase());
assert.equal(deploymentTransaction.from.toLowerCase(),plan.returnAddress.toLowerCase());
const chit=new Contract(state.chit,artifact('Chit').abi,provider),factory=new Contract(plan.factory,artifact('ChitFactory').abi,provider);
assert.equal(await chit.completed(),true);assert.equal(await chit.memberCount(),5n);
assert.equal(await chit.capacity(),5n);assert.equal(await chit.contribution(),parseEther('0.001'));
assert.equal(await chit.roundLength(),120n);assert.equal(await chit.commissionBps(),500n);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
let gasCost=0n,returned=0n;const receipts=[];
const rows=[...prior.transactions.map(t=>({...t,runId:1,chit:prior.chit})),...state.transactions.map(t=>({...t,runId:2,chit:state.chit}))];
for(let offset=0;offset<rows.length;offset+=3){
 const batch=await Promise.all(rows.slice(offset,offset+3).map(async row=>{
  const [receipt,tx]=await Promise.all([provider.getTransactionReceipt(row.hash),provider.getTransaction(row.hash)]);
  assert.ok(receipt&&tx,row.label);assert.equal(receipt.status,1,row.label);assert.equal(tx.chainId,43113n);
  assert.ok(plan.members.some(m=>same(m,tx.from)),'Unexpected sender');
  let decoded;
  if(row.label.startsWith('fund-member-')){
   const i=Number(row.label.split('-').at(-1))-1;assert.ok(same(tx.from,plan.members[0]));assert.ok(same(tx.to,plan.members[i]));assert.equal(tx.value,parseEther('0.0125'));
  }else if(row.label.startsWith('consolidate-member-')){
   assert.ok(same(tx.to,plan.members[0]));
  }else if(row.label.startsWith('return-unused-member-')){
   assert.ok(same(tx.to,plan.returnAddress));returned+=tx.value;
  }else if(row.label==='create-circle'){
   assert.ok(same(tx.to,plan.factory));decoded=factory.interface.parseTransaction({data:tx.data,value:tx.value});assert.equal(decoded.name,'createChit');
  }else{
   assert.ok(same(tx.to,row.chit),row.label);decoded=chit.interface.parseTransaction({data:tx.data,value:tx.value});
   const expected=row.label.startsWith('join-member-')?'join':row.label==='start-circle'?'start':row.label.includes('-contribute-')?'contribute':row.label.includes('-commit-')?'commitBid':row.label.includes('-reveal-')?'revealBid':row.label.endsWith('-settle')?'settle':row.label.startsWith('withdraw-')?'withdraw':null;
   assert.equal(decoded?.name,expected,row.label);
   if(row.label==='r3-contribute-3')assert.equal(tx.value,parseEther('0.0007625'),'round-three cash payment lowered by credit');
  }
  const cost=receipt.gasUsed*receipt.gasPrice;gasCost+=cost;
  return {runId:row.runId,label:row.label,hash:row.hash,blockNumber:receipt.blockNumber,status:'success',gasUsed:receipt.gasUsed.toString(),gasPriceWei:receipt.gasPrice.toString(),gasCostWei:cost.toString(),from:tx.from,to:tx.to,valueWei:tx.value.toString(),function:decoded?.name??'native-transfer'};
 }));receipts.push(...batch);
 await new Promise(r=>setTimeout(r,500));
}
assert.equal(receipts.length,119,'Expected both completed runs, including two missed reveals');
const retryReceipts=receipts.filter(r=>r.runId===2);assert.equal(retryReceipts.length,60);
assert.equal(retryReceipts.filter(r=>r.function==='contribute').length,24);
assert.equal(retryReceipts.filter(r=>r.function==='commitBid').length,5);assert.equal(retryReceipts.filter(r=>r.function==='revealBid').length,4);
assert.equal(retryReceipts.filter(r=>r.function==='settle').length,5);assert.equal(retryReceipts.filter(r=>r.function==='withdraw').length,6);
const previous=new Contract(prior.chit,artifact('Chit').abi,provider),fallback=await previous.rounds(4);
assert.equal(await previous.completed(),true);assert.equal(await provider.getBalance(prior.chit),0n);
assert.ok(same(fallback.winner,plan.members[3]));assert.equal(fallback.discount,0n);assert.equal(fallback.dividend,0n);
assert.equal((await previous.rounds(2)).slashed,parseEther('0.0007625'));
const rounds=[];
for(let r=1;r<=5;r++){
 const actual=await chit.rounds(r);assert.ok(same(actual.winner,plan.members[r-1]));
 assert.equal(actual.discount,r===1?0n:parseEther('0.001'));assert.equal(actual.dividend,r===1?0n:parseEther('0.0002375'));assert.equal(actual.commission,r===1?0n:parseEther('0.00005'));
 assert.equal(actual.slashed,r===2?parseEther('0.001'):0n);
 rounds.push({round:r,winner:actual.winner,prizeAVAX:formatEther(parseEther('0.005')-actual.discount),discountAVAX:formatEther(actual.discount),dividendPerOtherMemberAVAX:formatEther(actual.dividend),commissionAVAX:formatEther(actual.commission),slashedAVAX:formatEther(actual.slashed)});
}
const memberStates=await Promise.all(plan.members.map(async address=>{
 const [member,claimable,balance]=await Promise.all([chit.standing(address),chit.claimable(address),provider.getBalance(address)]);
 assert.equal(member.won,true);assert.equal(member.collateral,0n);assert.equal(member.credit,0n);assert.equal(claimable,0n);
 return {address,won:true,collateralWei:'0',creditWei:'0',claimableWei:'0',walletBalanceWei:balance.toString()};
}));
const finalContractBalance=await provider.getBalance(state.chit);assert.equal(finalContractBalance,0n);
const remaining=memberStates.reduce((sum,m)=>sum+BigInt(m.walletBalanceWei),0n);
assert.equal(returned+gasCost+remaining+finalContractBalance,parseEther('0.1'),'The funded 0.1 AVAX must equal returns + gas + remaining balances');
const report={status:'completed-with-rpc-timing-findings',financialChecksPassed:true,plannedAuctionAssertionsAllPassed:false,verifiedAtUTC:new Date().toISOString(),chainId:43113,factory:plan.factory,chit:state.chit,initialCircle:prior.chit,initialRunStatus:prior.status,retryRunStatus:state.status,initialRunDeviation:'RPC retry exhaustion interrupted round four; after resumption the reveal window had passed. Zero-discount fallback verified.',retryRunDeviation:'A connection reset interrupted round one; after resumption the reveal window had passed. Its fallback gave no dividend, so round-two default used 0.001 collateral rather than 0.0007625. Original failed assertions are retained.',initialFailedAssertions:prior.failures,retryFailedAssertions:state.failures,transactionCount:receipts.length,retryRunTransactions:60,contributions:48,commitments:10,reveals:8,settlements:10,withdrawals:12,rounds,members:memberStates,fundedAVAX:'0.1',returnedTo:plan.returnAddress,returnedAVAX:formatEther(returned),gasSpentAVAX:formatEther(gasCost),remainingInTestWalletsAVAX:formatEther(remaining),finalContractBalanceAVAX:'0.0',receipts};
fs.writeFileSync(file('fuji-live-independent-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,transactions:receipts.length,rounds:rounds.length,returnedAVAX:report.returnedAVAX,gasSpentAVAX:report.gasSpentAVAX,remainingInTestWalletsAVAX:report.remainingInTestWalletsAVAX,finalContractBalanceAVAX:'0'},null,2));provider.destroy();

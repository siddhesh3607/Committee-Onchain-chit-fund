// Supplements UI QA with the other four local wallets. Refuses remote RPCs.
import {JsonRpcProvider,Contract} from 'ethers';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const provider=new JsonRpcProvider('http://127.0.0.1:8545',43113,{cacheTimeout:-1});provider.pollingInterval=10;
if((await provider.getNetwork()).chainId!==43113n)throw Error('Wrong local chain');
const [action,address]=process.argv.slice(2);
const chit=new Contract(address,JSON.parse(readFileSync('artifacts/Chit.json')).abi,await provider.getSigner(0));
if(action==='join-rest')for(let i=0;i<5;i++){
 const signer=await provider.getSigner(i);const account=await signer.getAddress();if(!(await chit.standing(account)).joined)await(await chit.connect(signer).join({value:await chit.collateralRequired()})).wait();
}
else if(action==='pay-rest')for(let i=1;i<5;i++){
 if(i===4&&process.argv.includes('--skip-last'))continue;
 const signer=await provider.getSigner(i);const account=await signer.getAddress();if(!await chit.paid(await chit.currentRound(),account))await(await chit.connect(signer).contribute({value:await chit.due(account)})).wait();
}
else if(action==='finish')while(!await chit.completed()){
 const block=await provider.getBlock('latest');const deadline=Number(await chit.roundStart())+Number(await chit.roundLength());await provider.send('evm_increaseTime',[Math.max(0,deadline-block.timestamp)]);await provider.send('evm_mine',[]);await(await chit.settle()).wait();
}
else if(action==='verify-round-two'){
 const round=await chit.rounds(2);assert.equal(round.discount,6000000000000000n);assert.equal(round.slashed,8812500000000000n);
 assert.equal(round.dividend,1425000000000000n);assert.equal(round.winner,await(await provider.getSigner(1)).getAddress());
 const late=await chit.standing(await(await provider.getSigner(4)).getAddress());assert.equal(late.collateral,41187500000000000n);
 assert.equal(await chit.due(await(await provider.getSigner(2)).getAddress()),8575000000000000n);
 console.log('PASS: browser round-two bid, exact slash, dividend, winner and next payment match the contract.');
}
else if(action==='withdraw-rest'){
 for(let i=0;i<5;i++){
  const signer=await provider.getSigner(i),account=await signer.getAddress(),s=await chit.standing(account);
  if(s.collateral+s.credit+await chit.claimable(account)>0n)await(await chit.connect(signer).withdraw(account)).wait();
 }
 assert.equal(await provider.getBalance(address),0n);console.log('PASS: all five local browser-fixture wallets withdrew; contract balance is zero.');
}
else if(action!=='status')throw Error('Use join-rest, pay-rest, finish, or status');
const round=await chit.currentRound();const member=await chit.standing(await(await provider.getSigner(0)).getAddress());
console.log(JSON.stringify({chit:address,round:String(round),phase:String(await chit.phase()),members:String(await chit.memberCount()),collateral:String(member.collateral),credit:String(member.credit),prize:String(await chit.claimable(await(await provider.getSigner(0)).getAddress()))},null,2));provider.destroy();

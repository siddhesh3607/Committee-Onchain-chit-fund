import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptSvg,advanceSimulation,makeSimulation,simulationLiabilities,splitDiscount} from '../src/mechanism.mjs';
import {isUserRejection,shouldDiscardBid} from '../src/wallet-errors.mjs';
import {formatAvax} from '../src/amounts.mjs';
const receipt=circle=>receiptSvg({circle,round:1,winner:'Asha',prize:'0.04',dividend:'0.002375',slashed:'0',simulation:false});
test('receipt names cannot be truncated inside an escaped XML entity',()=>{
 const svg=receipt('&'.repeat(15)+'"');
 // An actual allowed 16-byte contract name used to emit an unterminated &quot.
 const name=svg.match(/<text x="80" y="185"[^>]*>(.*?)<\/text>/s)[1];
 assert.equal(name,'&amp;'.repeat(15)+'&quot;');
 assert.equal(name.replace(/&(?:amp|lt|gt|quot|apos);/g,''),'');
});
test('500 seeded simulator schedules preserve balances with random bids and withheld reveals',()=>{
 for(let seed=1;seed<=500;seed++){
  let state=makeSimulation(),random=seed;const rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random};
  for(let step=0;step<25;step++){
   const before=structuredClone(state);state=advanceSimulation(state,{missRoundTwo:seed%2===0,withhold:rng()%3===0,customBid:BigInt(rng())%(5n*10n**16n)});
   assert.equal(state.balance,simulationLiabilities(state));assert.ok(state.members.every(m=>m.credit>=0n&&m.collateral>=0n));
   assert.deepEqual(before.history,state.phase==='result'?state.history.slice(0,-1):state.history);
  }
  assert.equal(state.phase,'complete');assert.equal(new Set(state.history.map(r=>r.winner)).size,5);
 }
});
test('fees at both allowed extremes never lose any wei',()=>{
 for(const fee of [0n,1000n])for(const n of [2,5,32])for(const discount of [0n,1n,19n,99999n]){
  const split=splitDiscount(100000n,discount,n,fee);assert.equal(split.prize+split.commission+split.dividend*BigInt(n-1),100000n);
 }
});
test('bid cleanup recognizes explicit wallet rejections without discarding uncertain pending bids',()=>{
 assert.equal(isUserRejection({code:4001}),true);
 assert.equal(isUserRejection({cause:{cause:{name:'UserRejectedRequestError'}}}),true);
 assert.equal(isUserRejection({code:-32000,message:'RPC timed out'}),false);
 assert.equal(isUserRejection(new Error('Receipt timed out')),false);
 const cycle={};cycle.cause=cycle;assert.equal(isUserRejection(cycle),false);
 assert.equal(shouldDiscardBid({code:4001},false),true);
 assert.equal(shouldDiscardBid({code:4001},true),false,'a rejected retry must retain an earlier uncertain preimage');
 assert.equal(shouldDiscardBid({code:-32000},false),false);
});
test('all AVAX displays preserve one wei, fractional dividends and large balances exactly',()=>{
 assert.equal(formatAvax(1n),'0.000000000000000001');
 assert.equal(formatAvax(1187500000000000n),'0.0011875');
 assert.equal(formatAvax(0n),'0');assert.equal(formatAvax(10n**18n),'1');
 assert.equal(formatAvax(32000n*10n**18n+1n),'32,000.000000000000000001');
 assert.equal(formatAvax(-1n),'-0.000000000000000001');
});

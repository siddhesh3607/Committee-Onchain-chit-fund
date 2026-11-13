import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONTRIBUTION,advanceSimulation,makeSimulation,simulationLiabilities,splitDiscount,receiptSvg,netPayment} from '../src/mechanism.mjs';

test('browser simulation completes five rounds and preserves all wei after every phase',()=>{
 let state=makeSimulation();const initial=structuredClone(state);
 for(let i=0;i<25;i++){
  state=advanceSimulation(state,{missRoundTwo:true});
  assert.equal(state.balance,simulationLiabilities(state),`phase ${state.phase}, round ${state.round}`);
 }
 assert.equal(state.phase,'complete');assert.equal(state.history.length,5);
 assert.deepEqual(state.members.map(m=>m.won),[true,true,true,true,true]);
 assert.equal(state.history[1].slashed,7625000000000000n);
 assert.equal(state.members[4].collateral,CONTRIBUTION*5n-state.history[1].slashed);
 assert.deepEqual(makeSimulation(),initial,'advancing never mutates the initial state');
 assert.equal(advanceSimulation(state),state,'completed simulation is terminal');
});
test('zero reveals uses a zero-discount fallback; missed payments remain covered',()=>{
 let state=makeSimulation();for(let i=0;i<25;i++)state=advanceSimulation(state,{missRoundTwo:true,withhold:true});
 assert.deepEqual(state.history.map(r=>r.winner),[0,1,2,3,4]);
 assert.ok(state.history.every(r=>r.discount===0n&&r.commission===0n&&r.dividend===0n));
 assert.equal(state.history[1].slashed,CONTRIBUTION);assert.equal(state.balance,simulationLiabilities(state));
});
test('changing a proposed discount changes the winner; excluded member cannot bid twice',()=>{
 let state=advanceSimulation(makeSimulation());state=advanceSimulation(state,{customBid:0n});state=advanceSimulation(state);state=advanceSimulation(state);
 assert.equal(state.history[0].winner,1);assert.equal(state.history[0].discount,8500000000000000n);
 state=advanceSimulation(state);state=advanceSimulation(state);state=advanceSimulation(state,{customBid:CONTRIBUTION});
 assert.equal(state.members[1].committed,false);assert.equal(state.members[1].bid,0n);
});
test('dividend calculator conserves the pot, carries dust and bounds inputs',()=>{
 for(let n=2;n<=12;n++)for(let discount=0n;discount<100n;discount++){
  const r=splitDiscount(100n,discount,n,500n);assert.equal(r.prize+r.commission+r.dividend*BigInt(n-1),100n);
 }
 assert.equal(netPayment(CONTRIBUTION*2n),0n);
 assert.throws(()=>splitDiscount(100n,100n,5));assert.throws(()=>splitDiscount(100n,1n,1));
});
test('downloadable round cards distinguish simulations and escape user supplied circle names',()=>{
 const svg=receiptSvg({circle:'<script>&"',round:1,winner:'Asha',prize:'0.04',dividend:'0.002375',slashed:'0',simulation:true});
 assert.match(svg,/SIMULATION \/ NO ON-CHAIN TRANSACTION/);assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;&amp;&quot;/);
});

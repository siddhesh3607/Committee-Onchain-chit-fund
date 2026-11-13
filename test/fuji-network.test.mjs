import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPublicClient } from 'viem';
import { fujiTransport, pollSerial } from '../src/fuji-network.mjs';

async function endpoint(t, handler) {
 const server=createServer(handler); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close()});
 return `http://127.0.0.1:${server.address().port}`;
}
const success=(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:'0xa869'}))};
test('Fuji reads fail over after primary HTTP 429',async t=>{
 let failed=0,backup=0;
 const a=await endpoint(t,(_q,r)=>{failed++;r.writeHead(429);r.end('rate limited')});
 const b=await endpoint(t,(q,r)=>{backup++;success(q,r)});
 const c=createPublicClient({transport:fujiTransport(undefined,{urls:[a,b],retryCount:0})});
 assert.equal(await c.getChainId(),43113);assert.equal(failed,1);assert.equal(backup,1);
});
test('Fuji reads fail over after primary timeout',async t=>{
 const a=await endpoint(t,()=>{}),b=await endpoint(t,success);
 const c=createPublicClient({transport:fujiTransport(undefined,{urls:[a,b],timeout:40,retryCount:0})});
 assert.equal(await c.getChainId(),43113);
});
test('all unavailable endpoints reject rather than invent data',async t=>{
 const a=await endpoint(t,(_q,r)=>{r.writeHead(503);r.end()});
 const c=createPublicClient({transport:fujiTransport(undefined,{urls:[a],retryCount:0})});
 await assert.rejects(c.getChainId());
});
test('contract execution reverts are not retried on another endpoint',async t=>{
 let backup=0;
 const a=await endpoint(t,(_q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:3,message:'execution reverted'}}))});
 const b=await endpoint(t,(q,r)=>{backup++;success(q,r)});
 const c=createPublicClient({transport:fujiTransport(undefined,{urls:[a,b],retryCount:0})});
 await assert.rejects(c.request({method:'eth_call',params:[{to:'0x0000000000000000000000000000000000000001'},'latest']}));
 assert.equal(backup,0);
});
test('polling waits for completion and invalidates in-flight results on cleanup',async()=>{
 let resolve,active,scheduled=0;
 const stop=pollSerial(async isActive=>{active=isActive;await new Promise(r=>resolve=r)}, {schedule:()=>{scheduled++;return 1},cancel:()=>{}});
 assert.equal(scheduled,0);assert.equal(active(),true);
 stop();assert.equal(active(),false);resolve();await new Promise(r=>setImmediate(r));assert.equal(scheduled,0);
});
test('polling backs off failures and resets after recovery',async()=>{
 let callback,fail=true;const delays=[];
 const stop=pollSerial(async()=>{if(fail)throw Error('offline')},{delay:5,maxDelay:20,schedule:(fn,ms)=>{callback=fn;delays.push(ms);return 1},cancel:()=>{}});
 await new Promise(r=>setImmediate(r));await callback();await callback();fail=false;await callback();stop();
 assert.deepEqual(delays,[10,20,20,5]);
});

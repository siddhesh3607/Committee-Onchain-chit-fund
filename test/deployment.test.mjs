import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
function run(env){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/deploy.mjs'],{env,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));
})}
test('deployment without a key fails before attempting any network call',async()=>{
 const env={...process.env,FUJI_RPC_URL:'http://127.0.0.1:9'};delete env.DEPLOYER_PRIVATE_KEY;
 const result=await run(env);assert.notEqual(result.code,0);assert.match(result.output,/Set DEPLOYER_PRIVATE_KEY/);
});
test('deployment refuses the wrong chain before submitting any transaction',async()=>{
 const calls=[];const server=createServer(async(req,res)=>{let data='';for await(const part of req)data+=part;const body=JSON.parse(data);calls.push(body.method);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:'0x1'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  // Public disposable fixture key. The server is local and never accepts a transaction.
  const env={...process.env,DEPLOYER_PRIVATE_KEY:'0x'+'01'.repeat(32),FUJI_RPC_URL:`http://127.0.0.1:${server.address().port}`};
  const result=await run(env);assert.notEqual(result.code,0);assert.match(result.output,/Refusing non-Fuji deployment/);assert.deepEqual(calls,['eth_chainId']);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

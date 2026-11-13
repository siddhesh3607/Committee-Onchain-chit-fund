import ganache from 'ganache';
const server=ganache.server({chain:{chainId:43113,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:8,defaultBalance:100},logging:{quiet:true},miner:{timestampIncrement:0}});
await server.listen(8545,'127.0.0.1');
console.log('Disposable LOCAL QA chain: http://127.0.0.1:8545 (43113). Never fund these accounts on a public network.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0)});

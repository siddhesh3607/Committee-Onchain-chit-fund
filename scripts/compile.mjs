import fs from 'node:fs';
import solc from 'solc';
const sources = Object.fromEntries(['Chit.sol','ChitFactory.sol'].map(n=>[n,{content:fs.readFileSync(`contracts/${n}`,'utf8')}]));
const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
for (const e of output.errors??[]) { console.error(e.formattedMessage); if(e.severity==='error') process.exitCode=1; }
if(process.exitCode) process.exit(process.exitCode);
fs.mkdirSync('artifacts',{recursive:true}); fs.mkdirSync('src/generated',{recursive:true});
for(const [file,contracts] of Object.entries(output.contracts)) for(const [name,c] of Object.entries(contracts)) {
 const artifact={contractName:name,abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`};
 fs.writeFileSync(`artifacts/${name}.json`,JSON.stringify(artifact,null,2));
 fs.writeFileSync(`src/generated/${name}.ts`,`export const ${name} = ${JSON.stringify(artifact)} as const;\n`);
 console.log(`${name}: ${c.evm.deployedBytecode.object.length/2} bytes`);
}

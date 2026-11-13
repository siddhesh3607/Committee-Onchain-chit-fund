// Inventory advisory package files actually rendered into the production JS.
// This supplements npm audit; it is not an exploitability assessment.
import {build} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
const [auditPath,outputPath]=process.argv.slice(2);
if(!auditPath||!outputPath)throw Error('Usage: node scripts/audit-bundle.mjs audit.json output.json');
const audit=JSON.parse(readFileSync(auditPath));let rendered=[];
await build({build:{write:false},plugins:[{name:'qa-bundle-inventory',generateBundle(_options,bundle){
 for(const entry of Object.values(bundle))if(entry.type==='chunk')for(const [id,info] of Object.entries(entry.modules))if(info.renderedLength>0)rendered.push(id.replaceAll('\\','/'));
}}]});
const matches=Object.entries(audit.vulnerabilities||{}).map(([name,v])=>({
 name,severity:v.severity,directAdvisories:v.via.filter(x=>typeof x==='object').map(x=>({title:x.title,url:x.url})),
 files:rendered.filter(id=>v.nodes.some(node=>id.includes('/'+node.replaceAll('\\','/')+'/')))
})).filter(x=>x.files.length);
const report={counts:audit.metadata?.vulnerabilities,renderedAdvisoryPackages:matches,directlyAffectedRenderedPackages:matches.filter(x=>x.directAdvisories.length).map(x=>x.name),note:'A package with only transitive advisories is not proof that its affected dependency is bundled. Absence from rendered JS does not clear the installed dependency tree or replace security review.'};
writeFileSync(outputPath,JSON.stringify(report,null,2));console.log(JSON.stringify({installed:report.counts,renderedFlaggedPackages:matches.map(x=>x.name),directlyAffectedRenderedPackages:report.directlyAffectedRenderedPackages}));

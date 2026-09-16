const fs=require('fs');
const [,,a,b]=process.argv;
const load=p=>{const j=JSON.parse(fs.readFileSync(p,'utf8'));return j.rows||j.statements||Object.values(j).find(Array.isArray)};
const key=r=>`${r.file}#${r.model}.${r.op}#${r.shape}`;
const A=load(a),B=load(b);
const gate=r=>r.verdict==='SILENT_ZERO_AT_CUTOVER';
const ga=A.filter(gate),gb=B.filter(gate);
// line numbers shift inside the seeder (+10 lines of comment); key by file+model+op and count multiplicity
const bag=rows=>{const m=new Map();for(const r of rows){const k=key(r);m.set(k,(m.get(k)||0)+1)}return m};
const ba=bag(ga),bb=bag(gb);
const left=[],entered=[];
for(const [k,n] of ba){const d=n-(bb.get(k)||0);if(d>0)left.push([k,d])}
for(const [k,n] of bb){const d=n-(ba.get(k)||0);if(d>0)entered.push([k,d])}
const seedB=B.filter(r=>r.file.includes('seedStarterPlaybooks'));
const files=rows=>new Set(rows.map(r=>r.file)).size;
const out={before:{statements:ga.length,files:files(ga)},after:{statements:gb.length,files:files(gb)},
 leftGating:left,leftTotal:left.reduce((s,x)=>s+x[1],0),enteredGating:entered,
 seederAfter:{rows:seedB.length,byVerdict:seedB.reduce((m,r)=>(m[r.verdict]=(m[r.verdict]||0)+1,m),{}),byClient:seedB.reduce((m,r)=>(m[r.client]=(m[r.client]||0)+1,m),{})},
 totalsUnchanged:{statementsBefore:A.length,statementsAfter:B.length},
 driverPayArmsDisagreeAfter:gb.filter(r=>r.armsDisagree).length};
out.corrected={before:{statements:ga.length-11,files:files(ga)-7},after:{statements:gb.length-out.driverPayArmsDisagreeAfter,files:files(gb.filter(r=>!r.armsDisagree))}};
console.log(JSON.stringify(out,null,1));

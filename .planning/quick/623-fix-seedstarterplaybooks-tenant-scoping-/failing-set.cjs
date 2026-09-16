const path=require("path");const fs=require("fs");
const [,,inp,out]=process.argv;
const j=JSON.parse(fs.readFileSync(inp,"utf8"));
const root=path.resolve("apps/web");
const f=j.testResults.filter(t=>t.status!=="passed").map(t=>path.relative(root,t.name).split(path.sep).join("/")).sort();
fs.writeFileSync(out,f.join("\n")+"\n");
console.log("total",j.numTotalTests,"passed",j.numPassedTests,"failed",j.numFailedTests,"pending",j.numPendingTests,"failing files",f.length);

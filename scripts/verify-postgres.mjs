import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {execFile,spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,mkdir,unlink,writeFile} from "node:fs/promises";
import net from "node:net";
import {resolve,join} from "node:path";
import {promisify} from "node:util";
const exec=promisify(execFile);
const bin=resolve(process.env.PG_BIN||"target/pg-validation/pgsql/bin");
const pgExe=name=>join(bin,name+(process.platform==="win32"?".exe":""));
const root=await mkdtemp(resolve("test-results/postgres-")),data=join(root,"database"),store=join(root,"folio");
await mkdir(store);
async function freePort(){const listener=net.createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));return port;}
const pgPort=await freePort(),port=await freePort(),user="folio_verifier",password=randomBytes(24).toString("hex");
const connection={...process.env,PGHOST:"127.0.0.1",PGPORT:String(pgPort),PGUSER:user,PGPASSWORD:password,PGDATABASE:"postgres"};
const db=(sql)=>exec(pgExe("psql"),["-v","ON_ERROR_STOP=1","-Atc",sql],{env:connection,windowsHide:true}).then(r=>r.stdout.trim());
const pwfile=join(root,"initial-password");await writeFile(pwfile,password+"\n",{flag:"wx"});
try {await exec(pgExe("initdb"),["-D",data,"-U",user,"-A","scram-sha-256","--pwfile",pwfile,"--encoding=UTF8","--locale=C"],{windowsHide:true});}
finally {await unlink(pwfile);}
let server,pgRunning=false;
async function startDb(){
  const ctl=spawn(pgExe("pg_ctl"),["-D",data,"-l",join(root,"postgres.log"),"-w","-t","40","-o","-h 127.0.0.1 -p "+pgPort,"start"],{windowsHide:true,stdio:"ignore"});
  const [code]=await once(ctl,"exit");
  if(code!==0)throw Error("PostgreSQL startup failed. See "+join(root,"postgres.log"));
  pgRunning=true;
}
async function stopDb(){
  if(!pgRunning)return;
  await exec(pgExe("pg_ctl"),["-D",data,"-w","-m","fast","stop"],{windowsHide:true});pgRunning=false;
}
const url="http://127.0.0.1:"+port;process.env.FOLIO_URL=url;
async function startFolio(){
  server=spawn(resolve("target/release/keybi.exe"),[],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,FOLIO_PORT:String(port),FOLIO_DATA:store,FOLIO_POSTGRES:"host=127.0.0.1 port="+pgPort+" user="+user+" password="+password+" dbname=postgres sslmode=disable"}});
  let errors="";server.stderr.on("data",b=>{errors+=b.toString();});
  await Promise.race([once(server.stdout,"data"),once(server,"exit").then(()=>{throw Error("Folio PostgreSQL startup failed. "+errors.replaceAll(password,"[redacted]"));})]);
}
async function stopFolio(){if(server && server.exitCode===null){const done=once(server,"exit");server.kill();await done;}server=null;}

try{
  await startDb();await startFolio();
  const {verifyPublishing}=await import("./publish-report.mjs");await verifyPublishing();
  const {art,open,settled,studio}=await import("./portfolio-ui.mjs");
  let link;
  await studio(async p=>{
    await open(p,"Dispatch publication");await p.locator("header [data-action=library]").click();
    await p.getByRole("button",{name:"Publish report",exact:true}).click();const d=p.getByRole("dialog");
    await d.getByRole("button",{name:"Publish version",exact:true}).click();link=await d.getByLabel("Published link",{exact:true}).inputValue();
  });
  assert.equal(await db("SELECT count(*) FROM folio_reports"),"1");assert.equal(await db("SELECT count(*) FROM folio_publications"),"1");
  const version=await db("SHOW server_version");
  await stopFolio();await stopDb();await startDb();await startFolio();
  await studio(async p=>{
    await p.goto(link);await art(p,"Dispatch revenue").locator(".kpi").waitFor();await settled(p);
    assert.equal(await art(p,"Dispatch revenue").locator(".kpi").innerText(),"$251.00");
    await art(p,"Revenue by region").locator(".barrow").filter({hasText:"West"}).click();await settled(p);
    assert.equal(await art(p,"Dispatch revenue").locator(".kpi").innerText(),"$149.00");
  });
  await writeFile("portfolio-evidence/postgres-publication.json",JSON.stringify({version,metadata:"PostgreSQL",scram:true,draftRows:1,publicationRows:1,restartedDatabase:true,restartedApp:true,pinnedEast:251,readerWest:149},null,2));
  console.log("Verified publishing, update, withdrawal and a database/application restart on PostgreSQL "+version);
}finally{try{await stopFolio();}finally{await stopDb();}}


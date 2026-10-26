const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const DB_PATH = process.env.UPSTREAM_DB_PATH || process.env.API_KEY_DB_PATH || path.join(process.cwd(),"data","api-keys.sqlite");
let db, initPromise;
function run(sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(e){if(e)reject(e);else resolve({lastID:this.lastID,changes:this.changes});}));}
function get(sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(e,r)=>e?reject(e):resolve(r)));}
function all(sql,params=[]){return new Promise((resolve,reject)=>db.all(sql,params,(e,r)=>e?reject(e):resolve(r)));}
function encrypt(value){
  if(!value)return null;
  const secret=process.env.UPSTREAM_CREDENTIAL_ENCRYPTION_KEY;
  if(!secret || secret.length<32) throw new Error("UPSTREAM_CREDENTIAL_ENCRYPTION_KEY (32+ characters) is required to store upstream credentials.");
  const crypto=require("node:crypto"), key=crypto.createHash("sha256").update(secret).digest(), iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv), data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("hex"),cipher.getAuthTag().toString("hex"),data.toString("hex")].join(":");
}
function decrypt(value){
  if(!value)return null;
  const secret=process.env.UPSTREAM_CREDENTIAL_ENCRYPTION_KEY;
  if(!secret || secret.length<32) throw new Error("Upstream credential encryption key is not configured.");
  const crypto=require("node:crypto"),[iv,tag,data]=value.split(":"),key=crypto.createHash("sha256").update(secret).digest();
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"hex"));decipher.setAuthTag(Buffer.from(tag,"hex"));
  return Buffer.concat([decipher.update(Buffer.from(data,"hex")),decipher.final()]).toString("utf8");
}
async function init(){
 if(initPromise)return initPromise;
 initPromise=(async()=>{
  if(DB_PATH!==":memory:")fs.mkdirSync(path.dirname(path.resolve(DB_PATH)),{recursive:true});
  db=await new Promise((resolve,reject)=>{const x=new sqlite3.Database(DB_PATH,e=>e?reject(e):resolve(x));});
  await run(`CREATE TABLE IF NOT EXISTS upstream_servers(
   id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,url TEXT NOT NULL,
   enabled INTEGER NOT NULL DEFAULT 1,auth_type TEXT NOT NULL DEFAULT 'none',
   auth_secret TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const count=await get("SELECT COUNT(*) AS count FROM upstream_servers");
  if(!count.count){
   const defaults=[
    ["catalog-upstream",process.env.CATALOG_MCP_URL||"http://catalog-upstream:3101/mcp"],
    ["inventory-upstream",process.env.INVENTORY_MCP_URL||"http://inventory-upstream:3102/mcp"],
    ["woocommerce-upstream",process.env.WOOCOMMERCE_MCP_URL||"http://woocommerce-upstream:3103/mcp"]
   ];
   for(const [name,url] of defaults)await run("INSERT OR IGNORE INTO upstream_servers(name,url,enabled) VALUES(?,?,1)",[name,url]);
  }
 })();
 try{await initPromise;}catch(e){initPromise=null;db=null;throw e;}
}
function safe(row){return {id:row.id,name:row.name,url:row.url,enabled:!!row.enabled,authType:row.auth_type,hasCredential:!!row.auth_secret,createdAt:row.created_at,updatedAt:row.updated_at};}
async function list(){await init();return (await all("SELECT * FROM upstream_servers ORDER BY id")).map(safe);}
async function getEnabled(){await init();return (await all("SELECT * FROM upstream_servers WHERE enabled=1 ORDER BY id")).map(r=>({...safe(r),bearerToken:decrypt(r.auth_secret)}));}
async function save({id,name,url,enabled=true,bearerToken}){
 await init();
 const cleanName=String(name||"").trim(),cleanUrl=String(url||"").trim();
 if(!/^[a-z][a-z0-9-]{2,49}$/.test(cleanName))throw new Error("Name must be 3–50 lowercase letters, numbers or hyphens and start with a letter.");
 let parsed;try{parsed=new URL(cleanUrl);}catch{throw new Error("A valid upstream URL is required.");}
 if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error("Use an HTTP(S) URL without embedded credentials.");
 if(["localhost","127.0.0.1","0.0.0.0"].includes(parsed.hostname))throw new Error("Use a reachable cluster service hostname, not localhost.");
 const secret=bearerToken?encrypt(String(bearerToken)):null;
 if(id){
  const old=await get("SELECT * FROM upstream_servers WHERE id=?",[id]);if(!old)throw new Error("Upstream not found.");
  await run("UPDATE upstream_servers SET name=?,url=?,enabled=?,auth_type=?,auth_secret=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
   [cleanName,cleanUrl,enabled?1:0,secret?"bearer":"none",secret,id]);
  return (await all("SELECT * FROM upstream_servers WHERE id=?",[id])).map(safe)[0];
 }
 const result=await run("INSERT INTO upstream_servers(name,url,enabled,auth_type,auth_secret) VALUES(?,?,?,?,?)",
 [cleanName,cleanUrl,enabled?1:0,secret?"bearer":"none",secret]);
 return (await all("SELECT * FROM upstream_servers WHERE id=?",[result.lastID])).map(safe)[0];
}
async function remove(id){await init();const r=await run("DELETE FROM upstream_servers WHERE id=?",[id]);return r.changes===1;}
async function setEnabled(id,enabled){await init();const r=await run("UPDATE upstream_servers SET enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[enabled?1:0,id]);return r.changes===1;}
module.exports={init,list,getEnabled,save,remove,setEnabled};

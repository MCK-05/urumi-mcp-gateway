import React, { useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
const h = React.createElement;
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function App() {
  const [user,setUser]=useState(null), [email,setEmail]=useState(""), [password,setPassword]=useState("");
  const [error,setError]=useState(""), [notice,setNotice]=useState(""), [users,setUsers]=useState([]);
  const [keys,setKeys]=useState([]), [events,setEvents]=useState([]), [upstreams,setUpstreams]=useState([]);
  const [inviteEmail,setInviteEmail]=useState(""), [inviteRole,setInviteRole]=useState("member");
  const [newUserId,setNewUserId]=useState(""), [issuedKey,setIssuedKey]=useState("");
  async function refresh() {
    const me=await api("/api/auth/me"); setUser(me.user);
    if(me.user.role==="admin") {
      const [u,k,a,s]=await Promise.all([api("/api/team/users"),api("/api/keys"),api("/api/audit"),api("/api/upstreams")]);
      setUsers(u.users);setKeys(k.keys);setEvents(a.events);setUpstreams(s.upstreams);
    } else { const s=await api("/api/upstreams");setUpstreams(s.upstreams); }
  }
  useEffect(()=>{refresh().catch(()=>{});},[]);
  async function login(e){e.preventDefault();setError("");try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});setPassword("");await refresh();}catch(x){setError(x.message);}}
  async function logout(){await api("/api/auth/logout",{method:"POST"});setUser(null);}
  async function invite(e){e.preventDefault();setError("");try{const r=await api("/api/team/invites",{method:"POST",body:JSON.stringify({email:inviteEmail,role:inviteRole})});setNotice("Invite token (share securely; valid 24 hours): "+r.inviteToken);setInviteEmail("");}catch(x){setError(x.message);}}
  async function issue(e){e.preventDefault();setError("");try{const r=await api("/api/keys",{method:"POST",body:JSON.stringify({userId:newUserId})});setIssuedKey(r.apiKey);setNewUserId("");await refresh();}catch(x){setError(x.message);}}
  async function revoke(id){if(!confirm("Revoke this API key? The next MCP request using it will be rejected."))return;try{await api("/api/keys/"+id+"/revoke",{method:"POST"});await refresh();}catch(x){setError(x.message);}}
  async function disable(id,disabled){try{await api("/api/team/users/"+id,{method:"PATCH",body:JSON.stringify({disabled})});await refresh();}catch(x){setError(x.message);}}
  if(!user) return h("main",{className:"login card"},h("div",{className:"brand"},"URUMI / MCP GATEWAY"),h("h1",null,"Sign in"),h("p",null,"Use your dashboard team account."),error&&h("p",{className:"error"},error),h("form",{onSubmit:login},h("label",null,"Email",h("input",{type:"email",required:true,value:email,onChange:e=>setEmail(e.target.value)})),h("label",null,"Password",h("input",{type:"password",required:true,value:password,onChange:e=>setPassword(e.target.value)})),h("button",{type:"submit"},"Sign in")),h("small",null,"The first administrator is bootstrapped from server environment variables."));
  return h("main",{className:"shell"},h("header",null,h("div",null,h("div",{className:"brand"},"URUMI / MCP GATEWAY"),h("h1",null,"Control plane")),h("div",{className:"identity"},user.email+" · "+user.role,h("button",{className:"secondary",onClick:logout},"Sign out"))),
    error&&h("p",{className:"error"},error),notice&&h("p",{className:"notice"},notice),issuedKey&&h("section",{className:"card"},h("h2",null,"New API key — copy it now"),h("code",null,issuedKey),h("p",null,"This plaintext key will not be shown again."),h("button",{className:"secondary",onClick:()=>setIssuedKey("")},"I copied it")),
    h("section",{className:"grid"},h("article",{className:"card stat"},h("span",null,"UPSTREAMS"),h("strong",null,upstreams.length)),h("article",{className:"card stat"},h("span",null,"TEAM MEMBERS"),h("strong",null,users.length)),h("article",{className:"card stat"},h("span",null,"AUDIT EVENTS"),h("strong",null,events.length))),
    h("section",{className:"card"},h("h2",null,"Upstream servers"),h("p",{className:"muted"},"Current configured upstreams. Dynamic add/edit/disable controls are not enabled yet."),h("div",{className:"table-wrap"},h("table",null,h("thead",null,h("tr",null,...["Name","Endpoint","Management"].map(x=>h("th",{key:x},x)))),h("tbody",null,...upstreams.map(x=>h("tr",{key:x.name},h("td",null,x.name),h("td",null,x.url),h("td",null,x.management))))))),
    user.role==="admin"&&h(React.Fragment,null,
      h("section",{className:"card"},h("h2",null,"Invite team member"),h("form",{className:"inline",onSubmit:invite},h("input",{type:"email",placeholder:"member@example.com",required:true,value:inviteEmail,onChange:e=>setInviteEmail(e.target.value)}),h("select",{value:inviteRole,onChange:e=>setInviteRole(e.target.value)},h("option",{value:"member"},"Member"),h("option",{value:"admin"},"Admin")),h("button",{type:"submit"},"Create invite"))),
      h("section",{className:"card"},h("h2",null,"Team"),h("div",{className:"table-wrap"},h("table",null,h("thead",null,h("tr",null,...["Email","Role","Status","Action"].map(x=>h("th",{key:x},x)))),h("tbody",null,...users.map(x=>h("tr",{key:x.id},h("td",null,x.email),h("td",null,x.role),h("td",null,x.disabledAt?"Disabled":"Active"),h("td",null,x.role!=="admin"&&h("button",{className:"secondary",onClick:()=>disable(x.id,!x.disabledAt)},x.disabledAt?"Enable":"Disable"))))))),
      h("section",{className:"card"},h("h2",null,"Gateway API keys"),h("form",{className:"inline",onSubmit:issue},h("input",{placeholder:"User ID (team member ID or identity)",required:true,value:newUserId,onChange:e=>setNewUserId(e.target.value)}),h("button",{type:"submit"},"Generate key")),h("div",{className:"table-wrap"},h("table",null,h("thead",null,h("tr",null,...["ID","User","Created","Revoked","Action"].map(x=>h("th",{key:x},x)))),h("tbody",null,...keys.map(x=>h("tr",{key:x.id},h("td",null,x.id),h("td",null,x.userId),h("td",null,x.createdAt),h("td",null,x.revokedAt||"No"),h("td",null,!x.revokedAt&&h("button",{className:"danger",onClick:()=>revoke(x.id)},"Revoke"))))))),
      h("section",{className:"card"},h("h2",null,"Audit trail"),h("div",{className:"table-wrap"},h("table",null,h("thead",null,h("tr",null,...["User","Tool","Outcome","Timestamp","Duration"].map(x=>h("th",{key:x},x)))),h("tbody",null,...events.map(x=>h("tr",{key:x.id},h("td",null,x.userId),h("td",null,x.toolName),h("td",null,x.status),h("td",null,x.timestamp),h("td",null,x.durationMs+" ms"))))))))
    )
  );
}
createRoot(document.getElementById("root")).render(h(App));

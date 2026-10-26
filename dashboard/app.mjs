import React, { useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
const h = React.createElement;
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
  return data;
}
function Table({ headers, rows }) {
  const headerCells = headers.map(label => h("th", { key: label }, label));
  const bodyRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => h("td", { key: cellIndex }, cell));
    return h("tr", { key: rowIndex }, cells);
  });
  return h("div", { className: "table-wrap" },
    h("table", null,
      h("thead", null, h("tr", null, headerCells)),
      h("tbody", null, bodyRows)
    )
  );
}
function App() {
  const [user,setUser]=useState(null),[email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [users,setUsers]=useState([]),[keys,setKeys]=useState([]),[events,setEvents]=useState([]),[upstreams,setUpstreams]=useState([]);
  const [inviteEmail,setInviteEmail]=useState(""),[inviteRole,setInviteRole]=useState("member");
  const [newUserId,setNewUserId]=useState(""),[issuedKey,setIssuedKey]=useState("");
  const [upName,setUpName]=useState(""),[upUrl,setUpUrl]=useState(""),[upToken,setUpToken]=useState(""),[editUpId,setEditUpId]=useState(null);
  const [chatInput,setChatInput]=useState(""),[chatMessages,setChatMessages]=useState([]),[chatBusy,setChatBusy]=useState(false);

  async function refresh() {
    const me=await api("/api/auth/me");setUser(me.user);
    const ups=await api("/api/upstreams");setUpstreams(ups.upstreams);
    if(me.user.role==="admin"){
      const [u,k,a]=await Promise.all([api("/api/team/users"),api("/api/keys"),api("/api/audit")]);
      setUsers(u.users);setKeys(k.keys);setEvents(a.events);
    } else { setUsers([]);setKeys([]);setEvents([]); }
  }
  useEffect(()=>{refresh().catch(()=>{});},[]);
  async function login(e){e.preventDefault();setError("");try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});setPassword("");await refresh();}catch(x){setError(x.message);}}
  async function logout(){await api("/api/auth/logout",{method:"POST"});setUser(null);}
  async function invite(e){e.preventDefault();try{const r=await api("/api/team/invites",{method:"POST",body:JSON.stringify({email:inviteEmail,role:inviteRole})});setNotice("Invite token (share securely; valid 24 hours): "+r.inviteToken);setInviteEmail("");}catch(x){setError(x.message);}}
  async function saveUpstream(e){e.preventDefault();try{const payload={name:upName,url:upUrl,enabled:true,bearerToken:upToken||undefined};if(editUpId)await api("/api/upstreams/"+editUpId,{method:"PUT",body:JSON.stringify(payload)});else await api("/api/upstreams",{method:"POST",body:JSON.stringify(payload)});setUpName("");setUpUrl("");setUpToken("");setEditUpId(null);await refresh();}catch(x){setError(x.message);}}
  async function toggleUpstream(id,enabled){try{await api("/api/upstreams/"+id,{method:"PATCH",body:JSON.stringify({enabled})});await refresh();}catch(x){setError(x.message);}}
  async function removeUpstream(id){if(!confirm("Remove this upstream?"))return;try{await api("/api/upstreams/"+id,{method:"DELETE"});await refresh();}catch(x){setError(x.message);}}
  async function checkUpstream(id){try{const r=await api("/api/upstreams/"+id+"/check",{method:"POST"});setNotice("Upstream: "+r.status+(r.tools?" · "+r.tools.join(", "):""));}catch(x){setError(x.message);}}
  async function issue(e){e.preventDefault();try{const r=await api("/api/keys",{method:"POST",body:JSON.stringify({userId:newUserId})});setIssuedKey(r.apiKey);setNewUserId("");await refresh();}catch(x){setError(x.message);}}
  async function revoke(id){if(!confirm("Revoke this API key?"))return;try{await api("/api/keys/"+id+"/revoke",{method:"POST"});await refresh();}catch(x){setError(x.message);}}
  async function disable(id,disabled){try{await api("/api/team/users/"+id,{method:"PATCH",body:JSON.stringify({disabled})});await refresh();}catch(x){setError(x.message);}}
  async function sendChat(e){e.preventDefault();const message=chatInput.trim();if(!message||chatBusy)return;setChatMessages(m=>[...m,{role:"user",content:message}]);setChatInput("");setChatBusy(true);try{const r=await api("/api/chat",{method:"POST",body:JSON.stringify({message})});setChatMessages(m=>[...m,{role:"assistant",content:r.answer||"No text response.",toolCalls:r.toolCalls||[]}]);}catch(x){setChatMessages(m=>[...m,{role:"assistant",content:x.message,toolCalls:[]}]);}finally{setChatBusy(false);}}

  if(!user) {
    return h("main",{className:"login card"},[
      h("div",{className:"brand",key:"brand"},"URUMI / MCP GATEWAY"),
      h("h1",{key:"title"},"Sign in"),
      h("p",{key:"intro"},"Use your dashboard team account."),
      error&&h("p",{className:"error",key:"error"},error),
      h("form",{onSubmit:login,key:"form"},[
        h("label",{key:"email"},"Email",h("input",{type:"email",required:true,value:email,onChange:e=>setEmail(e.target.value)})),
        h("label",{key:"password"},"Password",h("input",{type:"password",required:true,value:password,onChange:e=>setPassword(e.target.value)})),
        h("button",{type:"submit",key:"submit"},"Sign in")
      ]),
      h("small",{key:"small"},"The first administrator is bootstrapped from server environment variables.")
    ]);
  }

  const header=h("header",{key:"header"},[
    h("div",{key:"heading"},[h("div",{className:"brand",key:"brand"},"URUMI / MCP GATEWAY"),h("h1",{key:"title"},"Control plane")]),
    h("div",{className:"identity",key:"identity"},[user.email+" · "+user.role,h("button",{className:"secondary",onClick:logout,key:"logout"},"Sign out")])
  ]);
  const messages=h("section",{className:"card",key:"chat"},[
    h("h2",{key:"title"},"Chat with your store"),
    h("p",{className:"muted",key:"description"},"Ask about products, inventory and orders. The assistant can call enabled MCP tools."),
    h("div",{className:"chat-log",key:"log"},chatMessages.map((m,i)=>h("div",{key:i,className:"chat-message "+m.role},[
      h("strong",{key:"who"},m.role==="user"?"You":"Urumi assistant"),
      h("p",{key:"content"},m.content),
      m.toolCalls?.length>0&&h("small",{key:"tools"},"Tool calls: "+m.toolCalls.map(t=>t.name+" ["+t.upstream+", "+t.outcome+"]").join(" · "))
    ]))),
    h("form",{className:"inline",onSubmit:sendChat,key:"form"},[
      h("input",{placeholder:"Ask about products, inventory or orders…",value:chatInput,onChange:e=>setChatInput(e.target.value),disabled:chatBusy,key:"input"}),
      h("button",{type:"submit",disabled:chatBusy,key:"send"},chatBusy?"Working…":"Send")
    ])
  ]);
  const stats=h("section",{className:"grid",key:"stats"},[
    h("article",{className:"card stat",key:"up"},[h("span",{key:"label"},"UPSTREAMS"),h("strong",{key:"value"},upstreams.length)]),
    h("article",{className:"card stat",key:"members"},[h("span",{key:"label"},"TEAM MEMBERS"),h("strong",{key:"value"},users.length)]),
    h("article",{className:"card stat",key:"audit"},[h("span",{key:"label"},"AUDIT EVENTS"),h("strong",{key:"value"},events.length)])
  ]);
  const upstreamRows=upstreams.map(x=>[
    x.name,x.url,x.status+(x.tools?.length?" · "+x.tools.join(", "):""),
    user.role==="admin"?h("div",{className:"actions"},[
      h("button",{className:"secondary",onClick:()=>checkUpstream(x.id),key:"check"},"Check"),
      h("button",{className:"secondary",onClick:()=>{setEditUpId(x.id);setUpName(x.name);setUpUrl(x.url);setUpToken("");},key:"edit"},"Edit"),
      h("button",{className:"secondary",onClick:()=>toggleUpstream(x.id,!x.enabled),key:"toggle"},x.enabled?"Disable":"Enable"),
      h("button",{className:"danger",onClick:()=>removeUpstream(x.id),key:"remove"},"Remove")
    ]):"Read only"
  ]);
  const upstreamSection=h("section",{className:"card",key:"upstreams"},[
    h("h2",{key:"title"},"Upstream servers"),
    user.role==="admin"&&h("form",{className:"inline",onSubmit:saveUpstream,key:"form"},[
      h("input",{placeholder:"name e.g. inventory-v2",required:true,value:upName,onChange:e=>setUpName(e.target.value),key:"name"}),
      h("input",{placeholder:"http://service:port/mcp",required:true,value:upUrl,onChange:e=>setUpUrl(e.target.value),key:"url"}),
      h("input",{placeholder:"Optional bearer token",value:upToken,onChange:e=>setUpToken(e.target.value),key:"token"}),
      h("button",{type:"submit",key:"save"},editUpId?"Save changes":"Add upstream"),
      editUpId&&h("button",{type:"button",className:"secondary",onClick:()=>{setEditUpId(null);setUpName("");setUpUrl("");setUpToken("");},key:"cancel"},"Cancel")
    ]),
    h(Table,{headers:["Name","Endpoint","Status and tools","Actions"],rows:upstreamRows,key:"table"})
  ]);

  const adminSections=user.role==="admin"?[
    h("section",{className:"card",key:"invite"},[
      h("h2",{key:"title"},"Invite team member"),
      h("form",{className:"inline",onSubmit:invite,key:"form"},[
        h("input",{type:"email",placeholder:"member@example.com",required:true,value:inviteEmail,onChange:e=>setInviteEmail(e.target.value),key:"email"}),
        h("select",{value:inviteRole,onChange:e=>setInviteRole(e.target.value),key:"role"},[h("option",{value:"member",key:"m"},"Member"),h("option",{value:"admin",key:"a"},"Admin")]),
        h("button",{type:"submit",key:"submit"},"Create invite")
      ])
    ]),
    h("section",{className:"card",key:"team"},[
      h("h2",{key:"title"},"Team"),
      h(Table,{headers:["Email","Role","Status","Action"],rows:users.map(x=>[x.email,x.role,x.disabledAt?"Disabled":"Active",x.role!=="admin"?h("button",{className:"secondary",onClick:()=>disable(x.id,!x.disabledAt)},x.disabledAt?"Enable":"Disable"):"Protected"]),key:"table"})
    ]),
    h("section",{className:"card",key:"keys"},[
      h("h2",{key:"title"},"Gateway API keys"),
      h("form",{className:"inline",onSubmit:issue,key:"form"},[
        h("input",{placeholder:"Active member email",required:true,value:newUserId,onChange:e=>setNewUserId(e.target.value),key:"email"}),
        h("button",{type:"submit",key:"submit"},"Generate key")
      ]),
      h(Table,{headers:["ID","User","Created","Revoked","Action"],rows:keys.map(x=>[x.id,x.userId,x.createdAt,x.revokedAt||"No",!x.revokedAt?h("button",{className:"danger",onClick:()=>revoke(x.id)},"Revoke"):"—"]),key:"table"})
    ]),
    h("section",{className:"card",key:"audit"},[
      h("h2",{key:"title"},"Audit trail"),
      h(Table,{headers:["User","Server","Tool","Outcome","Timestamp","Duration"],rows:events.map(x=>[x.userId,x.serverName,x.toolName,x.status,x.timestamp,x.durationMs+" ms"]),key:"table"})
    ])
  ]:[];
  return h("main",{className:"shell"},[
    header,
    error&&h("p",{className:"error",key:"error"},error),
    notice&&h("p",{className:"notice",key:"notice"},notice),
    issuedKey&&h("section",{className:"card",key:"issued"},[
      h("h2",{key:"title"},"New API key — copy it now"),
      h("code",{key:"code"},issuedKey),
      h("p",{key:"warning"},"This plaintext key will not be shown again."),
      h("button",{className:"secondary",onClick:()=>setIssuedKey(""),key:"done"},"I copied it")
    ]),
    messages,stats,upstreamSection,...adminSections
  ]);
}
createRoot(document.getElementById("root")).render(h(App));

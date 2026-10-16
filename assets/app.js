/* =========================================================
   BAKSANA Admin — uygulama kabuğu: giriş, yönlendirme, olaylar
========================================================= */
const NAV=[
  [null,[["overview","Genel Bakış","home"],["orders","Siparişler","orders"]]],
  ["Yönetim",[["businesses","İşletmeler","store"],["sites","Siteler","building"],["services","Hizmetler","grid"]]],
  ["Raporlar",[["finance","Finans","wallet"],["audit","İşlem günlüğü","log"]]],
  ["Sistem",[["settings","Ayarlar ve altyapı","settings"]]]
];
function buildNav(){
  $("sideNav").innerHTML=NAV.map(([sec,items])=>(sec?`<div class="side-sec">${sec}</div>`:"")+items.map(([k,l,i])=>
    `<button class="nav-item" type="button" data-nav="${k}" title="${l}">${ic(i)}<span class="nav-label">${l}</span>${k==="orders"?`<span class="nav-count" data-count="pending" hidden>0</span><span class="nav-dot" data-dot="pending" hidden></span>`:""}</button>`).join("")).join("");
  $("moreNav").innerHTML=NAV.flatMap(([,items])=>items).map(([k,l,i])=>`<button class="menu-item" type="button" data-nav="${k}">${ic(i)}${l}</button>`).join("")
    +`<button class="menu-item" type="button" data-action="refresh">${ic("refresh")}Verileri yenile</button><button class="menu-item danger" type="button" data-action="logout">${ic("logout")}Çıkış yap</button>`;
}

/* ===== GİRİŞ ===== */
function loginMsg(t){const b=$("loginError");b.textContent=t;b.hidden=false}
async function login(){
  const email=$("loginEmail").value.trim(),password=$("loginPassword").value,btn=$("loginBtn");
  $("loginError").hidden=true;
  if(!/^\S+@\S+\.\S+$/.test(email)){loginMsg("Geçerli bir e-posta adresi girin.");$("loginEmail").focus();return}
  if(!password){loginMsg("Şifrenizi girin.");$("loginPassword").focus();return}
  btn.disabled=true;btn.classList.add("loading");
  try{
    const{data,error}=await db.auth.signInWithPassword({email,password});
    if(error){loginMsg(/invalid login credentials/i.test(error.message)?"E-posta veya şifre hatalı.":"Giriş hatası: "+error.message);return}
    S.session=data.session;$("loginPassword").value="";
    await initAdmin();
  }catch(e){loginMsg("Bağlantı hatası: "+(e.message||"bilinmeyen"))}
  finally{btn.disabled=false;btn.classList.remove("loading")}
}
/* Yetki: profiles.role = 'admin' (mevcut kural). is_admin() SQL fonksiyonu kuruluysa
   sunucu tarafı sonucu da şart koşulur. Gerçek koruma RLS ve sunucu fonksiyonlarındadır. */
async function initAdmin(){
  try{
    if(!S.session?.user?.id){showLogin();return}
    const{data:p,error}=await db.from("profiles").select("id,role,full_name").eq("id",S.session.user.id).maybeSingle();
    if(error)throw error;
    if(!p||p.role!=="admin"){await db.auth.signOut();loginMsg("Bu hesap yönetici yetkisine sahip değil.");return}
    const fn=await db.rpc("is_admin");
    if(!fn.error&&fn.data!==true){await db.auth.signOut();loginMsg("Sunucu bu hesabı yönetici olarak doğrulamadı.");return}
    S.admin=p;
    document.querySelectorAll("[data-email]").forEach(e=>e.textContent=S.session.user.email||"");
    document.querySelectorAll("[data-initials]").forEach(e=>e.textContent=initials(p.full_name||S.session.user.email));
    $("loginScreen").style.display="none";$("app").style.display="block";
    parseHash();go(route.page,route.params,{replace:true});
    await loadAll(false);
    setupRealtime();
    clearInterval(initAdmin.poll);
    initAdmin.poll=setInterval(()=>{if(!document.hidden)loadAll(false)},30000);
    probeInfra();
  }catch(e){
    console.error("ADMIN INIT",e);showLogin();loginMsg("Sistem hatası: "+(e.message||"bilinmeyen"));
  }
}
let channel=null;
function setupRealtime(){
  if(channel)db.removeChannel(channel);
  channel=db.channel("baksana-admin");
  ["orders","businesses","sites","site_businesses"].forEach(t=>channel.on("postgres_changes",{event:"*",schema:"public",table:t},scheduleLoad));
  channel.subscribe();
}
function showLogin(){
  $("app").style.display="none";$("loginScreen").style.display="grid";
  if(channel){db.removeChannel(channel);channel=null}
  clearInterval(initAdmin.poll);closeAllLayers();closePops();
  Object.assign(S,{session:null,admin:null,orders:[],businesses:[],sites:[],links:[],loaded:false,loadErrors:{},lastSync:null});
}
async function logout(){try{await db.auth.signOut()}catch(e){console.error(e)}showLogin()}
db.auth.onAuthStateChange((ev,s)=>{S.session=s;if(ev==="SIGNED_OUT")showLogin()});

/* ===== YÖNLENDİRME ===== */
function parseHash(){
  const parts=location.hash.replace(/^#\/?/,"").split("/").filter(Boolean).map(decodeURIComponent);
  route={page:PAGES[parts[0]]?parts[0]:"overview",params:parts.slice(1)};
}
function go(page,params=[],opts={}){
  if(!PAGES[page])page="overview";
  route={page,params};
  const hash="#/"+[page,...params].map(encodeURIComponent).join("/");
  if(location.hash!==hash)history[opts.replace?"replaceState":"pushState"](null,"",hash);
  document.querySelectorAll(".side-nav [data-nav],.bottom [data-nav]").forEach(b=>{if(b.dataset.nav===page)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  const t=PAGES[page].title;
  $("crumb").textContent=t;document.title=t+" · BAKSANA Admin";
  closePops();
  render();
  if(!opts.keepScroll)window.scrollTo(0,0);
}
function render(){
  if(!S.admin)return;
  const v=$("view");
  const ae=document.activeElement,aeId=ae&&v.contains(ae)?ae.id:null,sel=aeId&&ae.selectionStart!=null?[ae.selectionStart,ae.selectionEnd]:null;
  v.innerHTML=PAGES[route.page].render(route.params);
  if(aeId&&$(aeId)){const el=$(aeId);el.focus();if(sel)try{el.setSelectionRange(sel[0],sel[1])}catch{}}
}
function renderAll(){
  const pend=S.orders.filter(o=>o.status==="Beklemede").length;
  document.querySelectorAll("[data-count=pending]").forEach(b=>{b.textContent=pend;b.hidden=!pend});
  document.querySelectorAll("[data-dot=pending]").forEach(b=>b.hidden=!pend);
  const att=attention();
  $("bellCount").textContent=att.length;$("bellCount").hidden=!att.length;
  if($("bellPop").classList.contains("show"))renderBell();
  render();
  const d=$("drawer");if(d.classList.contains("show")&&DRAWERS[d.dataset.kind])DRAWERS[d.dataset.kind].render(d.dataset.id);
}

/* ===== ÇEKMECELER ===== */
function openDrawer(kind,id){
  const d=$("drawer");d.dataset.kind=kind;d.dataset.id=String(id);
  DRAWERS[kind].render(String(id));
  openLayer(d,d.querySelector("[data-close]"));
}

/* ===== POPOVER ===== */
function closePops(){["bellPop","mePop"].forEach(id=>$(id).classList.remove("show"));$("bellBtn").setAttribute("aria-expanded","false");$("meBtn").setAttribute("aria-expanded","false")}
function togglePop(id,btn){const open=!$(id).classList.contains("show");closePops();if(open){$(id).classList.add("show");btn.setAttribute("aria-expanded","true");if(id==="bellPop")renderBell()}}
function renderBell(){
  const att=attention();
  $("bellPop").innerHTML=`<div class="pop-h">Dikkat gerektirenler<small>${att.length||""}</small></div><div class="pop-list">${att.length?att.slice(0,30).map(attentionHTML).join(""):`<div class="ok-line">${ic("check-c")}Şu an dikkat gerektiren konu yok.</div>`}</div>`;
}

/* ===== OLAYLAR ===== */
$("loginForm").addEventListener("submit",e=>{e.preventDefault();login()});
document.addEventListener("click",e=>{
  const t=e.target;
  if(!t.closest(".pop,#bellBtn,#meBtn"))closePops();
  const nav=t.closest("[data-nav]");
  if(nav){if($("moreModal").classList.contains("show"))closeLayer($("moreModal"));closePops();go(nav.dataset.nav,nav.dataset.params?nav.dataset.params.split("/"):[]);return}
  const oo=t.closest("[data-open-order]");
  if(oo){closePops();if($("moreModal").classList.contains("show"))closeLayer($("moreModal"));openDrawer("order",oo.dataset.openOrder);return}
  const ac=t.closest("[data-action]");
  if(ac&&!ac.disabled){
    const a=ac.dataset.action;
    if(a==="logout"){closePops();closeAllLayers();logout();return}
    if(a==="more"){openLayer($("moreModal"));return}
    if(a==="refresh"){if($("moreModal").classList.contains("show"))closeLayer($("moreModal"));loadAll(true);return}
  }
  const close=t.closest("[data-close]");
  if(close){const m=close.closest(".modal,.drawer");if(m)closeLayer(m);return}
  const d=$("drawer");
  if(d.contains(t)&&DRAWERS[d.dataset.kind]?.on){DRAWERS[d.dataset.kind].on("click",e);return}
  if($("view").contains(t))PAGES[route.page].on?.("click",e);
});
["input","change"].forEach(type=>document.addEventListener(type,e=>{
  if(e.target.id==="topSearch")return;
  const d=$("drawer");
  if(d.contains(e.target)&&DRAWERS[d.dataset.kind]?.on){DRAWERS[d.dataset.kind].on(type,e);return}
  if($("view").contains(e.target))PAGES[route.page].on?.(type,e);
}));
$("topSearch").addEventListener("input",e=>{ordersSearchFromTop(e.target.value)});
["genModal","confirmModal","moreModal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target.id===id)closeLayer($(id))}));
$("scrim").addEventListener("click",()=>closeLayer($("drawer")));
$("topRefresh").addEventListener("click",()=>loadAll(true));
$("bellBtn").addEventListener("click",e=>{e.stopPropagation();togglePop("bellPop",$("bellBtn"))});
$("meBtn").addEventListener("click",e=>{e.stopPropagation();if(matchMedia("(max-width:960px)").matches)openLayer($("moreModal"));else togglePop("mePop",$("meBtn"))});
$("collapseBtn").addEventListener("click",toggleSide);
function toggleSide(){
  const on=!document.body.classList.contains("side-collapsed");
  document.body.classList.toggle("side-collapsed",on);lsSet("bk_admin_side",on?"1":"0");
  $("collapseBtn").setAttribute("aria-label",on?"Menüyü genişlet":"Menüyü daralt");
  if(route.page==="settings")render();
}
if(lsGet("bk_admin_side")==="1")document.body.classList.add("side-collapsed");
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    if($("bellPop").classList.contains("show")||$("mePop").classList.contains("show")){closePops();return}
    const top=topLayer();if(top){e.preventDefault();closeLayer(top)}return;
  }
  trapFocus(e);
  if(e.key==="/"&&!layers.length&&S.admin&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){e.preventDefault();$("topSearch").focus()}
});
window.addEventListener("popstate",()=>{if(S.admin){parseHash();go(route.page,route.params,{replace:true})}});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&S.admin)loadAll(false)});

/* ===== BAŞLANGIÇ ===== */
buildNav();
(async()=>{
  try{
    const{data}=await db.auth.getSession();S.session=data.session;
    if(S.session)await initAdmin();else showLogin();
  }catch(e){showLogin();loginMsg("Sistem bağlantı hatası: "+(e.message||"bilinmeyen"))}
})();

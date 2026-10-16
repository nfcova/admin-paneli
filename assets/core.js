/* =========================================================
   BAKSANA Admin — çekirdek: Supabase, durum, yardımcılar, arayüz parçaları
   Sayfalar assets/pages/*.js içinde; her sayfa PAGES[...] kaydı ekler.
========================================================= */
const SUPABASE_URL="https://ahvplyeunubpbtsdzldj.supabase.co";
const SUPABASE_KEY="sb_publishable_qF3PlPnw-g4dXeOiL-OSOw_LzKQ9kuO";
/* Hesap işlemleri için Edge Function adı (supabase/functions/admin-business-account) */
const ACCOUNT_FN="admin-business-account";
const CUSTOMER_SITE_URL="https://nfcova.github.io/site-hizmet/";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

/* ===== DURUM ===== */
const S={
  session:null,admin:null,
  orders:[],businesses:[],sites:[],links:[],
  loaded:false,loadErrors:{},lastSync:null,
  /* Altyapı yoklaması: null = bilinmiyor, true/false = sonuç */
  infra:{isAdminFn:null,audit:null,accountFn:null,checkedAt:null}
};
const PAGES={};          /* sayfa kayıtları: {title, render(params), on(type,e)} */
const DRAWERS={};        /* çekmece kayıtları: {render(id), on(type,e)} */
let route={page:"overview",params:[]};

/* ===== YARDIMCILAR ===== */
const $=id=>document.getElementById(id);
const ic=n=>`<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function money(v){return Number(v||0).toLocaleString("tr-TR",{maximumFractionDigits:2})+" ₺"}
function hasPrice(o){return o.price!==null&&o.price!==undefined&&o.price!==""&&!isNaN(Number(o.price))}
function hhmm(v){const m=/^(\d{1,2}):(\d{2})/.exec(String(v||"").trim());return m?m[1].padStart(2,"0")+":"+m[2]:""}
function phoneDigits(v){return String(v||"").replace(/\D/g,"")}
function ymd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dateOnly(v){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||""));return m?m[0]:""}
/* Zaman damgası → yerel gün (YYYY-MM-DD); yalnızca tarih ise olduğu gibi */
function localDay(v){if(!v)return "";const s=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d)?"":ymd(d)}
function addDays(s,n){const[y,m,d]=s.split("-").map(Number);return ymd(new Date(y,m-1,d+n))}
const TODAY=()=>ymd(new Date());
function dateTR(v){
  if(!v)return "-";const s=String(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const[y,m,d]=s.split("-");return `${d}.${m}.${y}`}
  const d=new Date(s);return isNaN(d)?s:new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
}
function stamp(v){
  if(!v)return "";const d=new Date(v);if(isNaN(d))return String(v);
  return new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);
}
function ago(v){
  const d=new Date(v);if(!v||isNaN(d))return "";
  const s=Math.round((Date.now()-d)/1000);
  if(s<60)return "az önce";if(s<3600)return Math.floor(s/60)+" dk önce";
  if(s<86400)return Math.floor(s/3600)+" sa önce";if(s<86400*7)return Math.floor(s/86400)+" gün önce";
  return stamp(v);
}
function dayLabel(v){
  const s=dateOnly(v);if(!s)return "-";const t=TODAY();
  if(s===t)return "Bugün";if(s===addDays(t,1))return "Yarın";if(s===addDays(t,-1))return "Dün";
  const[y,m,d]=s.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",...(y!==new Date().getFullYear()?{year:"numeric"}:{})}).format(new Date(y,m-1,d));
}
function initials(n){return String(n||"A").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toLocaleUpperCase("tr-TR")||"A"}
function norm(v){return String(v||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9ıüğşöç]+/g," ").trim()}
function lower(v){return String(v||"").toLocaleLowerCase("tr-TR")}
function optionOf(o){try{return o.details?.option||(typeof o.details==="string"?JSON.parse(o.details||"{}").option:"")||""}catch{return ""}}
function lsGet(k){try{return localStorage.getItem(k)}catch{return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch{}}
const same=(a,b)=>String(a)===String(b);
function plural(n,w){return `${n} ${w}`}

/* ===== VERİ SÖZLÜĞÜ ===== */
const STATUS={"Beklemede":"amber","Kabul Edildi":"blue","Devam Ediyor":"violet","Tamamlandı":"green","Reddedildi":"red","İptal Edildi":"gray"};
const STATUS_LIST=Object.keys(STATUS);
const CLOSED=["Tamamlandı","Reddedildi","İptal Edildi"];
/* Müşteri sitesindeki (site-hizmet) sabit hizmet kataloğu — veritabanında hizmet tablosu yok */
const SERVICE_CATALOG={
  "Ev Temizliği":["1+1 Ev","2+1 Ev","3+1 Ev","4+1 Ev"],
  "Teknik Servis":["Elektrik","Tesisat","Montaj","Diğer"],
  "Araç Yıkama":["Otomobil","SUV","Ticari","İç + Dış"],
  "Koltuk Yıkama":["Koltuk","Kanepe","Sandalye","Yatak"],
  "Halı Yıkama":["Halı","Yolluk","Kilim","Halı + Yolluk"]
};
/* Mevcut admin panelinin kullandığı işletme kategorileri (businesses.category). Değerler
   create_public_order eşleştirmesinde kullanılıyor olabileceği için DEĞİŞTİRİLMEDİ. */
const BASE_CATEGORIES=["Temizlik","Teknik Servis","Araç Yıkama","Koltuk Yıkama"];
function categories(){return [...new Set([...BASE_CATEGORIES,...S.businesses.map(b=>b.category).filter(Boolean)])]}
const PROPOSAL_ACCEPTED=["accepted","approved","kabul","kabul edildi","kabul_edildi"];
const PROPOSAL_REJECTED=["rejected","declined","ret","red","reddedildi","reddedilen"];
function propState(o){
  if(!o||!o.proposed_service_time)return null;
  const s=lower(String(o.time_proposal_status||"").trim());
  if(PROPOSAL_ACCEPTED.includes(s))return "accepted";
  if(PROPOSAL_REJECTED.includes(s))return "declined";
  return "pending";
}
function effTime(o){return propState(o)==="accepted"?hhmm(o.proposed_service_time):hhmm(o.service_time)}

/* ===== ARAMA TABLOLARI ===== */
const bizById=id=>S.businesses.find(b=>same(b.id,id));
const siteById=id=>S.sites.find(s=>same(s.id,id));
const orderById=id=>S.orders.find(o=>same(o.id,id));
const bizName=id=>id==null?"Atanmamış":(bizById(id)?.name||"#"+id);
const siteName=id=>id==null?"-":(siteById(id)?.name||"#"+id);
const linksOfBiz=id=>S.links.filter(l=>same(l.business_id,id));
const linksOfSite=id=>S.links.filter(l=>same(l.site_id,id));

/* ===== ROZETLER ===== */
function badge(status){return `<span class="badge ${STATUS[status]||"amber"}">${esc(status||"Beklemede")}</span>`}
function activeBadge(a){return `<span class="badge ${a?"green":""}">${a?"Aktif":"Pasif"}</span>`}
function propTag(o){
  if(CLOSED.includes(o.status))return "";
  const ps=propState(o);
  if(ps==="pending")return `<span class="tag amber">${ic("clock")}Müşteri yanıtı bekleniyor</span>`;
  if(ps==="accepted")return `<span class="tag green">${ic("check")}Saat onaylandı</span>`;
  if(ps==="declined"&&o.status==="Beklemede")return `<span class="tag red">${ic("x")}Öneri reddedildi</span>`;
  return "";
}
function emptyHTML(icon,title,text,btn){
  return `<div class="empty"><div class="empty-ic">${ic(icon)}</div><b>${esc(title)}</b>${text?`<p>${text}</p>`:""}${btn||""}</div>`;
}
function errorHTML(msg){
  return `<div class="empty err"><div class="empty-ic">${ic("alert")}</div><b>Veriler yüklenemedi</b><p>${esc(msg)}</p><button class="btn btn-secondary" type="button" data-action="refresh">${ic("refresh")}Tekrar dene</button></div>`;
}
function skeletonRows(n){return Array.from({length:n},()=>`<div class="sk-row"><span class="sk" style="width:38%"></span><span class="sk" style="width:62%"></span></div>`).join("")}
/* Tablo verisi hazır değilse iskelet/hata döndürür */
function gate(...tables){
  const errs=tables.map(t=>S.loadErrors[t]).filter(Boolean);
  if(errs.length&&!S.loaded)return errorHTML(errs.join(" · "));
  if(!S.loaded)return skeletonRows(4);
  if(errs.length)return errorHTML(errs.join(" · "));
  return null;
}
function syncHTML(){
  if(Object.keys(S.loadErrors).length&&S.loaded)return `<span class="sync off"><i></i>Bazı veriler yüklenemedi</span>`;
  if(!S.lastSync)return `<span class="sync off"><i></i>Yükleniyor…</span>`;
  return `<span class="sync"><i></i>Canlı · ${esc(new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit"}).format(S.lastSync))}</span>`;
}

/* ===== BİLDİRİM ===== */
function toast(message,type="success"){
  const box=$("toasts");const t=document.createElement("div");
  t.className="toast "+type;if(type==="error")t.setAttribute("role","alert");
  t.innerHTML=ic(type==="error"?"alert":type==="warn"?"info":"check-c")+`<span>${esc(message)}</span>`;
  box.appendChild(t);while(box.children.length>3)box.firstChild.remove();
  setTimeout(()=>t.remove(),type==="success"?3500:7000);
}

/* ===== KATMANLAR (modal / çekmece) ===== */
const layers=[];
function openLayer(el,focusEl){
  if(!layers.some(l=>l.el===el))layers.push({el,ret:document.activeElement});
  el.classList.add("show");el.setAttribute("aria-hidden","false");
  if(el.classList.contains("drawer"))$("scrim").classList.add("show");
  document.body.classList.add("locked");
  requestAnimationFrame(()=>{(focusEl||el.querySelector("[data-autofocus]")||el.querySelector("input:not([type=hidden]),select,textarea,button:not([disabled])"))?.focus()});
}
function closeLayer(el){
  if(!el)return;
  const i=layers.findIndex(l=>l.el===el);
  el.classList.remove("show");el.setAttribute("aria-hidden","true");
  if(el.classList.contains("drawer")){$("scrim").classList.remove("show");el.dataset.kind="";el.dataset.id=""}
  if(i>-1){const[l]=layers.splice(i,1);if(l.ret&&l.ret.isConnected)l.ret.focus()}
  if(!layers.length)document.body.classList.remove("locked");
}
const topLayer=()=>layers[layers.length-1]?.el;
function closeAllLayers(){[...layers].reverse().forEach(l=>closeLayer(l.el))}
function trapFocus(e){
  const el=topLayer();if(!el||e.key!=="Tab")return;
  const f=[...el.querySelectorAll("button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex='-1'])")].filter(x=>x.offsetParent!==null);
  if(!f.length)return;const first=f[0],last=f[f.length-1];
  if(!el.contains(document.activeElement)){e.preventDefault();first.focus();return}
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}

/* Genel modal: içerik HTML + butonlar. Döndürülen nesne ile içerik güncellenebilir. */
function modal({title,sub,body,foot,wide,id="genModal"}){
  const m=$(id);
  /* Pencere öğesi yeniden kullanılıyor: önceki formdan kalan onay bayraklarını temizle */
  Object.keys(m.dataset).forEach(k=>delete m.dataset[k]);
  m.querySelector(".modal-box").classList.toggle("wide",!!wide);
  m.querySelector(".modal-box").innerHTML=`
    <div class="modal-h"><div class="t"><h2 id="${id}T">${esc(title)}</h2>${sub?`<p>${sub}</p>`:""}</div><button class="icon-btn" type="button" data-close aria-label="Kapat">${ic("x")}</button></div>
    <div class="modal-b">${body||""}</div>
    ${foot?`<div class="modal-f">${foot}</div>`:""}`;
  m.querySelector(".modal-box").setAttribute("aria-labelledby",id+"T");
  openLayer(m);
  return m;
}

/* Onay penceresi. cb ok/stale/error döndürür; "error"da pencere açık kalır.
   typed: kritik işlemlerde kullanıcıdan yazarak onay istenir. */
function confirmDialog({title,text,label="Onayla",cls="btn-primary",typed,cb}){
  const m=$("confirmModal");
  m.querySelector(".modal-box").innerHTML=`
    <div class="modal-h"><div class="t"><h2 id="cfT">${esc(title)}</h2><p>${text}</p></div></div>
    <div class="modal-b" style="padding-top:12px">
      ${typed?`<label class="label" for="cfTyped">Onaylamak için <b>${esc(typed)}</b> yazın</label><input class="input" id="cfTyped" autocomplete="off">`:""}
      <div class="field-err" id="cfErr" role="alert"></div>
    </div>
    <div class="modal-f"><button class="btn btn-secondary" type="button" data-close>Vazgeç</button><button class="btn ${cls}" type="button" id="cfOk">${esc(label)}</button></div>`;
  m.querySelector(".modal-box").setAttribute("aria-labelledby","cfT");
  openLayer(m,typed?$("cfTyped"):$("cfOk"));
  $("cfOk").onclick=async()=>{
    if(typed&&$("cfTyped").value.trim()!==typed){$("cfErr").textContent="Onay metni eşleşmiyor.";return}
    const ok=$("cfOk");ok.disabled=true;ok.classList.add("loading");
    try{
      const r=await cb();
      if(r==="error"){$("cfErr").textContent="İşlem tamamlanamadı. Hata mesajını kontrol edip tekrar deneyebilirsiniz."}
      else closeLayer(m);
    }finally{if(ok.isConnected){ok.disabled=false;ok.classList.remove("loading")}}
  };
}

/* ===== VERİ YÜKLEME ===== */
let loadP=null,reloadTimer=null;
async function fetchAll(notify){
  const rb=$("topRefresh");rb.disabled=true;rb.classList.add("spinning");
  try{
    const res=await Promise.all([
      db.from("orders").select("*").order("created_at",{ascending:false}),
      db.from("businesses").select("*").order("created_at",{ascending:false}),
      db.from("sites").select("*").order("created_at",{ascending:false}),
      db.from("site_businesses").select("*").order("created_at",{ascending:false})
    ]).catch(e=>{throw e});
    const keys=["orders","businesses","sites","links"],labels={orders:"Siparişler",businesses:"İşletmeler",sites:"Siteler",links:"Site–işletme bağlantıları"};
    const errs={};
    res.forEach((r,i)=>{const k=keys[i];if(r.error)errs[k]=labels[k]+": "+r.error.message;else S[k]=r.data||[]});
    S.loadErrors=errs;S.loaded=true;S.lastSync=new Date();
    renderAll();
    const e=Object.values(errs);
    if(e.length)toast(e[0],"error");else if(notify)toast("Veriler güncellendi");
    return !e.length;
  }catch(e){
    S.loadErrors={net:"Bağlantı hatası: "+(e.message||"bilinmeyen")};
    renderAll();toast(S.loadErrors.net,"error");return false;
  }finally{rb.disabled=false;rb.classList.remove("spinning")}
}
/* Aynı anda tek yükleme; bekleyen çağrı mevcut yükleme bitince taze veri çeker */
async function loadAll(notify){
  if(!S.admin)return false;
  while(loadP){try{await loadP}catch{}}
  if(!S.admin)return false;
  loadP=fetchAll(notify);
  try{return await loadP}finally{loadP=null}
}
function scheduleLoad(){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadAll(false),500)}

/* ===== YAZMA YARDIMCISI =====
   Supabase güncellemesi hata vermese de RLS nedeniyle 0 satır etkilenebilir; bu durumda
   başarı mesajı gösterilmez. Dönüş: "ok" | "stale" | "error" */
async function write(q,{ok,err,expect=1}){
  try{
    const{data,error}=await q.select();
    if(error){toast(err+": "+error.message,"error");return {r:"error",error}}
    if(!data||data.length<expect){
      toast(err+": kayıt değişmedi. Yetkiniz olmayabilir (RLS) ya da kayıt başka biri tarafından değiştirilmiş olabilir.","error");
      await loadAll(false);return {r:"stale"};
    }
    /* Geçmiş kartları yeni günlük kayıtlarını göstersin */
    if(typeof histCache!=="undefined")for(const k in histCache)delete histCache[k];
    await loadAll(false);
    if(ok)toast(ok);
    return {r:"ok",data};
  }catch(e){toast(err+": "+(e.message||"Bağlantı hatası"),"error");return {r:"error",error:e}}
}

/* ===== ALTYAPI YOKLAMASI =====
   Paneldeki bazı bölümler SQL/Edge Function kurulumuna bağlı. Kurulu olup olmadıkları
   salt-okunur isteklerle kontrol edilir; hiçbir veri değiştirilmez. */
async function probeInfra(){
  const r={isAdminFn:null,audit:null,accountFn:null,checkedAt:new Date()};
  try{const{data,error}=await db.rpc("is_admin");r.isAdminFn=error?(/does not exist|could not find|not find the function/i.test(error.message)?false:null):data===true}catch{r.isAdminFn=null}
  try{const{error}=await db.from("admin_audit_log").select("id",{head:true,count:"exact"}).limit(1);r.audit=error?(/does not exist|could not find|relation/i.test(error.message)?false:null):true}catch{r.audit=null}
  try{
    const{data,error}=await db.functions.invoke(ACCOUNT_FN,{body:{action:"ping"}});
    r.accountFn=!error&&data?.ok===true;
  }catch{r.accountFn=false}
  S.infra=r;
  render();
  return r;
}
async function callAccountFn(body){
  const{data,error}=await db.functions.invoke(ACCOUNT_FN,{body});
  if(error){
    let msg=error.message||"Edge Function hatası";
    try{const j=await error.context?.json?.();if(j?.error)msg=j.error}catch{}
    if(/Failed to send a request|FunctionsFetchError|404/i.test(msg))msg="Hesap servisi (Edge Function) kurulu değil veya erişilemiyor.";
    throw new Error(msg);
  }
  if(!data||data.ok!==true)throw new Error(data?.error||"Hesap servisi beklenmeyen yanıt döndürdü.");
  return data;
}

/* ===== CSV ===== */
function downloadCSV(name,rows){
  /* Müşteri girdisi (blok, daire vb.) Excel'de formül olarak çalışmasın: =,+,-,@ ile başlayana ' eklenir */
  const cell=v=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[";\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  /* Excel (TR) için noktalı virgül ayırıcı + UTF-8 BOM */
  const csv="﻿"+rows.map(r=>r.map(cell).join(";")).join("\r\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

/* ===== SAYFALAMA ===== */
function paginate(list,page,size=25){
  const pages=Math.max(1,Math.ceil(list.length/size));
  const p=Math.min(Math.max(1,page),pages);
  return {rows:list.slice((p-1)*size,p*size),page:p,pages,total:list.length,from:list.length?(p-1)*size+1:0,to:Math.min(p*size,list.length)};
}
function pagerHTML(pg,key){
  if(pg.total<=0)return "";
  return `<div class="pager"><span>${pg.from}–${pg.to} / ${pg.total}</span>${pg.pages>1?`<div class="pg">
    <button class="btn btn-secondary btn-sm" type="button" data-page-key="${key}" data-page-to="${pg.page-1}" ${pg.page<=1?"disabled":""} aria-label="Önceki sayfa">${ic("chev-l")}</button>
    <span class="num">${pg.page} / ${pg.pages}</span>
    <button class="btn btn-secondary btn-sm" type="button" data-page-key="${key}" data-page-to="${pg.page+1}" ${pg.page>=pg.pages?"disabled":""} aria-label="Sonraki sayfa">${ic("chev-r")}</button></div>`:""}</div>`;
}
function sortHead(label,key,st,cls=""){
  const on=st.sort===key;
  return `<th class="${cls}" ${on?`aria-sort="${st.dir==="asc"?"ascending":"descending"}"`:""}><button type="button" data-sort="${key}">${label}${on?ic(st.dir==="asc"?"chev-u":"chev-d"):""}</button></th>`;
}
function applySort(list,st,getters){
  const g=getters[st.sort];if(!g)return list;
  const d=st.dir==="asc"?1:-1;
  return [...list].sort((a,b)=>{const x=g(a),y=g(b);return (typeof x==="number"&&typeof y==="number"?x-y:String(x??"").localeCompare(String(y??""),"tr"))*d});
}

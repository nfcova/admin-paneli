/* =========================================================
   İşlem günlüğü — admin_audit_log (sql/03 ile kurulur)
   Kayıtlar veritabanı tetikleyicileriyle yazılır; tarayıcı yazamaz, yalnızca admin okuyabilir.
========================================================= */
const AUD={rows:null,loading:false,error:"",table:"",q:"",page:1};
const histCache={};
const TABLE_TR={orders:"Sipariş",businesses:"İşletme",sites:"Site",site_businesses:"Site–işletme bağlantısı",profiles:"Kullanıcı profili"};
const ACTION_TR={INSERT:"Oluşturuldu",UPDATE:"Güncellendi",DELETE:"Silindi"};
function auditChanges(r){
  if(r.action!=="UPDATE"||!r.old_data||!r.new_data)return "";
  const keys=Object.keys(r.new_data).filter(k=>JSON.stringify(r.new_data[k])!==JSON.stringify(r.old_data[k])&&!/updated_at/.test(k));
  return keys.slice(0,6).map(k=>`${k}: ${fmtVal(r.old_data[k])} → ${fmtVal(r.new_data[k])}`).join(" · ");
}
function fmtVal(v){if(v===null||v===undefined)return "∅";if(typeof v==="boolean")return v?"evet":"hayır";const s=typeof v==="object"?JSON.stringify(v):String(v);return s.length>40?s.slice(0,40)+"…":s}
function auditRowHTML(r){
  return `<div class="li"><div class="li-ic ${r.action==="DELETE"?"red":r.action==="INSERT"?"green":"violet"}">${ic(r.action==="INSERT"?"plus":r.action==="DELETE"?"x":"edit")}</div><div class="li-t"><b>${esc(TABLE_TR[r.table_name]||r.table_name)} ${esc(ACTION_TR[r.action]||r.action)} <span class="mono muted">#${esc(r.record_id)}</span></b><small title="${esc(auditChanges(r))}">${esc(r.actor_email||r.actor_id||"sistem")} · ${esc(stamp(r.created_at))}${auditChanges(r)?" · "+esc(auditChanges(r)):""}</small></div></div>`;
}
async function loadAudit(){
  AUD.loading=true;AUD.error="";render();
  try{
    let q=db.from("admin_audit_log").select("*").order("created_at",{ascending:false}).limit(500);
    if(AUD.table)q=q.eq("table_name",AUD.table);
    const{data,error}=await q;
    if(error)throw error;AUD.rows=data||[];
  }catch(e){AUD.error=e.message||"Yüklenemedi";AUD.rows=null}
  AUD.loading=false;if(route.page==="audit")render();
}
/* İşletme/site detayındaki “Geçmiş” kartı */
function historyCardHTML(kind,id){
  const head=`<div class="card-head"><div><h2>Kayıt ve durum geçmişi</h2><p>Admin işlem günlüğü</p></div></div>`;
  if(S.infra.audit===null)return `<section class="card">${head}${skeletonRows(1)}</section>`;
  if(!S.infra.audit)return `<section class="card">${head}<div class="card-body"><div class="note">${ic("info")}<div>İşlem günlüğü kurulu değil (sql/03). Kurulduktan sonra bu kayıt üzerindeki her ekleme/değişiklik kimin tarafından ne zaman yapıldığıyla burada görünür. Şu an yalnızca kayıt tarihi biliniyor.</div></div></div></section>`;
  const key=kind+":"+id,c=histCache[key];
  if(!c){histCache[key]={loading:true};(async()=>{
    const col=kind==="business"?"business_id":"site_id";
    const{data,error}=await db.from("admin_audit_log").select("*").eq(col,String(id)).order("created_at",{ascending:false}).limit(30);
    histCache[key]=error?{error:error.message}:{rows:data||[]};
    if((route.page==="businesses"||route.page==="sites")&&same(route.params[0],id))render();
  })();return `<section class="card">${head}${skeletonRows(2)}</section>`}
  if(c.loading)return `<section class="card">${head}${skeletonRows(2)}</section>`;
  if(c.error)return `<section class="card">${head}<div class="card-body"><div class="alert alert-error">${ic("alert")}<div>${esc(c.error)}</div></div></div></section>`;
  return `<section class="card">${head}${c.rows.length?c.rows.map(auditRowHTML).join(""):emptyHTML("log","Kayıt yok","Günlük kurulduktan sonra yapılan işlemler burada listelenir.")}</section>`;
}
PAGES.audit={
  title:"İşlem günlüğü",
  render(){
    const head=`<div class="page-head"><div><h1>İşlem günlüğü</h1><p>İşletme, site, eşleştirme, sipariş ve profil tablolarındaki değişiklikler</p></div>${S.infra.audit?`<div class="actions"><button class="btn btn-secondary" type="button" data-au="reload">${ic("refresh")}Yenile</button></div>`:""}</div>`;
    if(S.infra.audit===null)return head+`<section class="card">${skeletonRows(3)}</section>`;
    if(!S.infra.audit)return head+`<section class="card"><div class="card-body"><div class="alert alert-warn">${ic("info")}<div><b>İşlem günlüğü kurulu değil.</b> <code>sql/03_islem_gunlugu.sql</code> dosyası Supabase SQL Editor'da çalıştırıldığında; işletme, site, site–işletme bağlantısı, sipariş ve profil tablolarındaki her değişiklik (kimin yaptığı, eski ve yeni değerler) otomatik kaydedilir. Kayıtları tarayıcı yazamaz ve değiştiremez; yalnızca adminler okuyabilir.</div></div></div></section>`;
    if(AUD.rows===null&&!AUD.loading&&!AUD.error){queueMicrotask(loadAudit);return head+`<section class="card">${skeletonRows(4)}</section>`}
    const q=lower(AUD.q.trim());
    const list=(AUD.rows||[]).filter(r=>!q||[r.actor_email,r.record_id,r.table_name,JSON.stringify(r.new_data||r.old_data||{})].some(v=>lower(v).includes(q)));
    const pg=paginate(list,AUD.page,30);
    return head+`<section class="card"><div class="toolbar"><label class="search">${ic("search")}<span class="sr">Günlükte ara</span><input id="auq" type="search" placeholder="Kişi, kayıt no veya içerik" value="${esc(AUD.q)}"></label>
      <select class="select" id="auT" aria-label="Tablo"><option value="">Tüm tablolar</option>${Object.entries(TABLE_TR).map(([k,v])=>`<option value="${k}" ${AUD.table===k?"selected":""}>${v}</option>`).join("")}</select></div>
      ${AUD.error?errorHTML(AUD.error):AUD.loading&&!AUD.rows?skeletonRows(4):list.length?pg.rows.map(auditRowHTML).join("")+pagerHTML(pg,"audit"):emptyHTML("log","Kayıt yok","Henüz kaydedilmiş işlem yok.")}
      <div class="card-foot">Son 500 kayıt gösterilir.</div></section>`;
  },
  on(type,e){
    const t=e.target;
    if(type==="click"){if(t.closest("[data-au=reload]"))loadAudit();const p=t.closest("[data-page-key=audit]");if(p){AUD.page=Number(p.dataset.pageTo);render()}if(t.closest("[data-action=refresh]")){AUD.rows=null;AUD.error=""}return}
    if(t.id==="auq"&&type==="input"){AUD.q=t.value;AUD.page=1;render()}
    if(t.id==="auT"&&type==="change"){AUD.table=t.value;AUD.page=1;loadAudit()}
  }
};
/* Sipariş detayında değişiklik kayıtları (günlük kuruluysa) */
function orderAuditHTML(id){
  if(!S.infra.audit)return "";
  const key="order:"+id,c=histCache[key];
  if(!c){histCache[key]={loading:true};(async()=>{
    const{data,error}=await db.from("admin_audit_log").select("*").eq("order_id",String(id)).order("created_at",{ascending:false}).limit(30);
    histCache[key]=error?{error:error.message}:{rows:data||[]};
    const d=$("drawer");if(d.dataset.kind==="order"&&same(d.dataset.id,id))DRAWERS.order.render(String(id));
  })()}
  const body=!c||c.loading?skeletonRows(1):c.error?`<div class="alert alert-error">${ic("alert")}<div>${esc(c.error)}</div></div>`:c.rows.length?c.rows.map(auditRowHTML).join(""):`<p class="field-help">Günlük kurulduktan sonra bu siparişte değişiklik olmadı.</p>`;
  return `<div class="dr-sec"><h3>Değişiklik kayıtları</h3><div class="card" style="box-shadow:none">${body}</div></div>`;
}

/* =========================================================
   Siparişler — listeleme, filtre, CSV, detay ve işletme atama
   Admin sipariş durumunu doğrudan DEĞİŞTİRMEZ; durum akışı müşteri ve işletmeye aittir.
   Atama yalnızca admin_assign_order RPC'si üzerinden yapılır.
========================================================= */
const OTABS=[
  ["all","Tümü",()=>true],
  ["pending","Bekleyen",o=>o.status==="Beklemede"],
  ["active","Devam eden",o=>o.status==="Kabul Edildi"||o.status==="Devam Ediyor"],
  ["completed","Tamamlanan",o=>o.status==="Tamamlandı"],
  ["rejected","Reddedilen",o=>o.status==="Reddedildi"],
  ["cancelled","İptal",o=>o.status==="İptal Edildi"]
];
const OF={tab:"all",q:"",from:"",to:"",dateField:"created",service:"",site:"",biz:"",flag:"",sort:"created",dir:"desc",page:1};
function ordersSearchFromTop(v){OF.q=v;OF.page=1;if(route.page!=="orders"){OF.tab="all";go("orders",[],{keepScroll:true});$("topSearch").focus()}else render()}

function orderMatches(o,ignoreTab){
  const q=lower(OF.q.trim());
  if(q){
    const qd=q.replace(/\D/g,"");
    const hit=[o.order_code,o.service,o.customer_name,o.block,o.apartment,siteName(o.site_id),bizName(o.business_id),optionOf(o)].some(v=>lower(v).includes(q))||(qd.length>=3&&phoneDigits(o.phone).includes(qd));
    if(!hit)return false;
  }
  const d=OF.dateField==="service"?dateOnly(o.service_date):localDay(o.created_at);
  if(OF.from&&(!d||d<OF.from))return false;
  if(OF.to&&(!d||d>OF.to))return false;
  if(OF.service&&o.service!==OF.service)return false;
  if(OF.site&&!same(o.site_id,OF.site))return false;
  if(OF.biz==="none"){if(o.business_id!=null)return false}else if(OF.biz&&!same(o.business_id,OF.biz))return false;
  if(OF.flag==="proposal"&&!(propState(o)&&!CLOSED.includes(o.status)))return false;
  if(OF.flag==="proposal_pending"&&!(propState(o)==="pending"&&!CLOSED.includes(o.status)))return false;
  if(OF.flag==="unassigned"&&!(o.business_id==null&&!CLOSED.includes(o.status)))return false;
  if(!ignoreTab&&!(OTABS.find(t=>t[0]===OF.tab)||OTABS[0])[2](o))return false;
  return true;
}
const ORDER_SORT={created:o=>o.created_at||"",service_date:o=>(dateOnly(o.service_date)||"")+effTime(o),code:o=>o.order_code||"",price:o=>hasPrice(o)?Number(o.price):-1,status:o=>o.status||""};
function filteredOrders(){return applySort(S.orders.filter(o=>orderMatches(o)),OF,ORDER_SORT)}

PAGES.orders={
  title:"Siparişler",
  render(params){
    if(params[0]&&OTABS.some(t=>t[0]===params[0])&&OF.tab!==params[0]){OF.tab=params[0];OF.page=1}
    const g=gate("orders");
    const base=S.orders.filter(o=>orderMatches(o,true));
    const list=filteredOrders(),pg=paginate(list,OF.page);
    const services=[...new Set(S.orders.map(o=>o.service).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr"));
    const opt=(v,l,c)=>`<option value="${esc(v)}" ${String(c)===String(v)?"selected":""}>${esc(l)}</option>`;
    const filtered=OF.q||OF.from||OF.to||OF.service||OF.site||OF.biz||OF.flag;
    return `
    <div class="page-head"><div><h1>Siparişler</h1><p>Tüm sitelerden gelen siparişler · ${syncHTML()}</p></div>
      <div class="actions"><button class="btn btn-secondary" type="button" data-o="csv" ${list.length?"":"disabled"}>${ic("download")}CSV indir (${list.length})</button></div></div>
    <section class="card">
      <div class="tabs" role="tablist" aria-label="Sipariş durumu">${OTABS.map(t=>`<button class="tab" type="button" role="tab" aria-selected="${t[0]===OF.tab}" data-otab="${t[0]}">${t[1]}<span class="cnt">${S.loaded?base.filter(t[2]).length:"–"}</span></button>`).join("")}</div>
      <div class="toolbar">
        <label class="search">${ic("search")}<span class="sr">Siparişlerde ara</span><input id="oq" type="search" placeholder="Kod, müşteri, telefon, site, işletme" value="${esc(OF.q)}" autocomplete="off"></label>
        <select class="select" id="oDateField" aria-label="Tarih alanı">${opt("created","Oluşturulma tarihi",OF.dateField)}${opt("service","Hizmet tarihi",OF.dateField)}</select>
        <div class="daterange"><input class="input" id="oFrom" type="date" value="${esc(OF.from)}" aria-label="Başlangıç tarihi"><span>–</span><input class="input" id="oTo" type="date" value="${esc(OF.to)}" aria-label="Bitiş tarihi"></div>
        <select class="select" id="oService" aria-label="Hizmet">${opt("","Tüm hizmetler",OF.service)}${services.map(s=>opt(s,s,OF.service)).join("")}</select>
        <select class="select" id="oSite" aria-label="Site">${opt("","Tüm siteler",OF.site)}${S.sites.map(s=>opt(s.id,s.name,OF.site)).join("")}</select>
        <select class="select" id="oBiz" aria-label="İşletme">${opt("","Tüm işletmeler",OF.biz)}${opt("none","Atanmamış",OF.biz)}${S.businesses.map(b=>opt(b.id,b.name,OF.biz)).join("")}</select>
        <select class="select" id="oFlag" aria-label="Ek filtre">${opt("","Ek filtre yok",OF.flag)}${opt("proposal_pending","Saat önerisi yanıt bekliyor",OF.flag)}${opt("proposal","Saat önerisi olan (açık)",OF.flag)}${opt("unassigned","Atanmamış (açık)",OF.flag)}</select>
        ${filtered?`<button class="btn btn-ghost" type="button" data-o="clear">${ic("x")}Temizle</button>`:""}
      </div>
      ${g||(list.length?`<table class="tbl cards"><thead><tr>${sortHead("Sipariş","code",OF)}<th>Müşteri / site</th><th>İşletme</th>${sortHead("Randevu","service_date",OF)}${sortHead("Oluşturulma","created",OF,"hide-m")}${sortHead("Fiyat","price",OF,"r")}${sortHead("Durum","status",OF)}</tr></thead><tbody>
        ${pg.rows.map(o=>`<tr class="click" data-open-order="${esc(o.id)}" tabindex="0">
          <td class="m-title"><b>${esc(o.service||"Hizmet")}</b><small class="mono">${esc(o.order_code||"#"+o.id)}</small>${propTag(o)?`<div class="tags" style="margin-top:4px">${propTag(o)}</div>`:""}</td>
          <td><span class="clip">${esc(o.customer_name||"-")}</span><small>${esc(siteName(o.site_id))}${o.block||o.apartment?` · ${esc(o.block||"-")}/${esc(o.apartment||"-")}`:""}</small></td>
          <td data-l="İşletme">${o.business_id==null?`<span class="tag red">Atanmamış</span>`:esc(bizName(o.business_id))}</td>
          <td class="nw num" data-l="Randevu">${esc(dateTR(o.service_date))} ${esc(effTime(o))}</td>
          <td class="nw hide-m m-hide">${esc(stamp(o.created_at))}</td>
          <td class="r" data-l="Fiyat">${hasPrice(o)?money(o.price):'<span class="muted">—</span>'}</td>
          <td class="m-top">${badge(o.status)}</td></tr>`).join("")}
        </tbody></table>${pagerHTML(pg,"orders")}`
        :filtered?emptyHTML("search","Sonuç bulunamadı","Arama veya filtrelere uyan sipariş yok.",`<button class="btn btn-secondary" type="button" data-o="clear">Filtreleri temizle</button>`)
        :emptyHTML("inbox","Bu görünümde sipariş yok",""))}
    </section>`;
  },
  on(type,e){
    const t=e.target;
    if(type==="click"){
      const tab=t.closest("[data-otab]");if(tab){OF.tab=tab.dataset.otab;OF.page=1;go("orders",[OF.tab],{replace:true,keepScroll:true});return}
      const s=t.closest("[data-sort]");if(s){const k=s.dataset.sort;if(OF.sort===k)OF.dir=OF.dir==="asc"?"desc":"asc";else{OF.sort=k;OF.dir=k==="code"||k==="status"?"asc":"desc"}render();return}
      const p=t.closest("[data-page-key=orders]");if(p){OF.page=Number(p.dataset.pageTo);render();window.scrollTo(0,0);return}
      const a=t.closest("[data-o]")?.dataset.o;
      if(a==="clear"){Object.assign(OF,{q:"",from:"",to:"",service:"",site:"",biz:"",flag:"",page:1});$("topSearch").value="";render()}
      if(a==="csv")exportOrdersCSV(filteredOrders());
      return;
    }
    const id=t.id,v=t.value;
    const map={oq:"q",oFrom:"from",oTo:"to",oService:"service",oSite:"site",oBiz:"biz",oFlag:"flag",oDateField:"dateField"};
    if(map[id]&&(type==="input"?id==="oq":true)){
      OF[map[id]]=v;OF.page=1;
      if(id==="oq")$("topSearch").value=v;
      if(OF.from&&OF.to&&OF.from>OF.to){toast("Başlangıç tarihi bitiş tarihinden sonra olamaz.","error");OF[map[id]]="";}
      render();
    }
  }
};
/* Klavye ile satır açma */
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches?.("tr[data-open-order]"))openDrawer("order",e.target.dataset.openOrder)});

function exportOrdersCSV(list){
  const head=["Sipariş kodu","Durum","Hizmet","Seçenek","Oluşturulma","Hizmet tarihi","İstenen saat","Önerilen saat","Öneri durumu","Kesinleşen saat","Müşteri","Telefon","Site","Blok","Daire","İşletme","Fiyat","Kabul","Tamamlanma","Red nedeni","İptal nedeni","İptal zamanı"];
  const rows=list.map(o=>[o.order_code||"#"+o.id,o.status,o.service,optionOf(o),stamp(o.created_at),dateTR(o.service_date),hhmm(o.service_time),hhmm(o.proposed_service_time),o.time_proposal_status||"",effTime(o),o.customer_name,o.phone,siteName(o.site_id),o.block,o.apartment,o.business_id==null?"":bizName(o.business_id),hasPrice(o)?String(o.price).replace(".",","):"",stamp(o.accepted_at),stamp(o.completed_at),o.rejection_reason,o.cancellation_reason,stamp(o.cancelled_at)]);
  downloadCSV(`baksana-siparisler-${TODAY()}.csv`,[head,...rows]);
  toast(`${list.length} sipariş CSV olarak indirildi`);
}

/* ===== SİPARİŞ DETAYI ===== */
function orderTimeline(o){
  const ev=[];
  if(o.created_at)ev.push(["","Sipariş oluşturuldu",o.created_at]);
  if(o.time_proposed_at)ev.push(["c-amber",`İşletme saat önerdi (${hhmm(o.proposed_service_time)||"-"})`,o.time_proposed_at,propState(o)==="accepted"?"Müşteri kabul etti":propState(o)==="declined"?"Müşteri reddetti":"Yanıt bekleniyor"]);
  if(o.accepted_at)ev.push(["c-violet","İşletme kabul etti",o.accepted_at]);
  if(o.rejected_at)ev.push(["c-red","İşletme reddetti",o.rejected_at,o.rejection_reason]);
  if(o.completed_at)ev.push(["c-green","İş tamamlandı",o.completed_at]);
  if(o.cancelled_at)ev.push(["c-red","Müşteri iptal etti",o.cancelled_at,o.cancellation_reason]);
  ev.sort((a,b)=>new Date(a[2])-new Date(b[2]));
  return `<ol class="timeline">${ev.map(e=>`<li class="${e[0]}"><b>${esc(e[1])}</b><small>${esc(stamp(e[2]))}${e[3]?" · "+esc(e[3]):""}</small></li>`).join("")}</ol>
    <p class="field-help">Geçmiş, siparişteki zaman damgası alanlarından oluşturulur. Müşterinin saat önerisine yanıt verdiği an veritabanında ayrı bir alan olarak tutulmuyor${S.infra.audit?"; admin işlemleri İşlem günlüğünde":""}.</p>`;
}
function canAssign(o){return o.status==="Beklemede"}
DRAWERS.order={
  render(id){
    const d=$("drawer"),o=orderById(id);
    if(!o){d.innerHTML=`<div class="dr-head"><div class="t"><h2 id="drTitle">Sipariş bulunamadı</h2></div><button class="icon-btn" type="button" data-close aria-label="Kapat">${ic("x")}</button></div><div class="dr-body">${emptyHTML("alert","Sipariş listede yok","Silinmiş veya erişim dışı olabilir.")}</div>`;return}
    const scroll=d.querySelector(".dr-body")?.scrollTop||0;
    const ps=propState(o),tel=phoneDigits(o.phone),site=siteById(o.site_id),biz=bizById(o.business_id);
    d.innerHTML=`
    <div class="dr-head"><div class="t"><h2 id="drTitle">${esc(o.service||"Hizmet")}</h2><div class="meta"><span class="mono">${esc(o.order_code||"#"+o.id)}</span>${badge(o.status)}${propTag(o)}</div></div><button class="icon-btn" type="button" data-close aria-label="Detayı kapat">${ic("x")}</button></div>
    <div class="dr-body">
      ${o.business_id==null&&!CLOSED.includes(o.status)?`<div class="alert alert-error" style="margin-top:16px">${ic("alert")}<div><b>Bu sipariş hiçbir işletmeye atanmamış.</b> İşletmeler göremez; aşağıdan atama yapın.</div></div>`:""}
      ${biz&&!biz.active&&!CLOSED.includes(o.status)?`<div class="alert alert-warn" style="margin-top:16px">${ic("ban")}<div>Atanmış işletme <b>pasif</b>. İşletme panele giriş yapamaz; yeniden atama gerekebilir.</div></div>`:""}
      ${o.status==="İptal Edildi"?`<div class="alert alert-error" style="margin-top:16px">${ic("ban")}<div><b>Müşteri iptal etti.</b>${o.cancellation_reason?" Neden: "+esc(o.cancellation_reason):""}</div></div>`:""}
      ${o.status==="Reddedildi"?`<div class="alert alert-info" style="margin-top:16px">${ic("x-c")}<div><b>İşletme reddetti.</b>${o.rejection_reason?" Neden: "+esc(o.rejection_reason):""}</div></div>`:""}
      ${ps?`<div class="prop ${ps}"><div class="prop-h">${ic(ps==="accepted"?"check-c":ps==="declined"?"x-c":"clock")}${ps==="pending"?(CLOSED.includes(o.status)?"Saat önerisi yanıtlanmadı":"Saat önerisi müşteri yanıtı bekliyor"):ps==="accepted"?"Müşteri önerilen saati kabul etti":"Müşteri önerilen saati reddetti"}</div><p>İstenen <b>${esc(hhmm(o.service_time)||"-")}</b> → önerilen <b>${esc(hhmm(o.proposed_service_time))}</b>${o.time_proposed_at?` · ${esc(stamp(o.time_proposed_at))}`:""}${o.time_proposal_status?` · durum: <span class="mono">${esc(o.time_proposal_status)}</span>`:""}</p></div>`:""}
      <div class="dr-sec"><h3>Randevu</h3><dl class="kv">
        <dt>Hizmet tarihi</dt><dd>${esc(dateTR(o.service_date))} <span class="muted">· ${esc(dayLabel(o.service_date))}</span></dd>
        <dt>İstenen saat</dt><dd class="num">${esc(hhmm(o.service_time)||"-")}</dd>
        <dt>Kesinleşen saat</dt><dd class="num">${ps==="pending"?'<span class="muted">Öneri yanıt bekliyor</span>':esc(effTime(o)||"-")}</dd>
        <dt>Oluşturulma</dt><dd>${esc(stamp(o.created_at))}</dd>
      </dl></div>
      <div class="dr-sec"><h3>Müşteri</h3><dl class="kv">
        <dt>Ad</dt><dd>${esc(o.customer_name||"-")}</dd>
        <dt>Telefon</dt><dd>${tel?`<a href="tel:${esc(tel)}">${esc(o.phone)}</a>`:"-"}</dd>
        <dt>Site</dt><dd>${site?`<a href="#/sites/${esc(site.id)}" data-close>${esc(site.name)}</a>`:esc(siteName(o.site_id))}</dd>
        <dt>Blok / Daire</dt><dd>${esc(o.block||"-")} / ${esc(o.apartment||"-")}</dd>
      </dl></div>
      <div class="dr-sec"><h3>Hizmet ve ücret</h3><dl class="kv">
        <dt>Hizmet</dt><dd>${esc(o.service||"-")}</dd>
        ${optionOf(o)?`<dt>Seçenek</dt><dd>${esc(optionOf(o))}</dd>`:""}
        <dt>Sipariş fiyatı</dt><dd class="num">${hasPrice(o)?money(o.price):'<span class="muted">Belirtilmemiş</span>'}</dd>
      </dl>${o.note?`<div class="textbox" style="margin-top:8px">${esc(o.note)}</div>`:""}</div>
      <div class="dr-sec"><h3>İşletme</h3><dl class="kv">
        <dt>Atanmış işletme</dt><dd>${biz?`<a href="#/businesses/${esc(biz.id)}" data-close>${esc(biz.name)}</a> ${activeBadge(biz.active)}`:o.business_id!=null?"#"+esc(o.business_id):'<span class="tag red">Atanmamış</span>'}</dd>
        ${biz?`<dt>Kategori</dt><dd>${esc(biz.category||"-")}</dd>`:""}
      </dl></div>
      <div class="dr-sec"><h3>Geçmiş</h3>${orderTimeline(o)}</div>
      ${orderAuditHTML(o.id)}
    </div>
    <div class="dr-foot">${canAssign(o)?`<button class="btn btn-primary" type="button" data-od="assign">${ic("swap")}${o.business_id==null?"İşletmeye ata":"Yeniden ata"}</button>`
      :`<div class="field-help" style="flex:1;text-align:center">${CLOSED.includes(o.status)?"Kapanmış siparişlerde atama değiştirilemez.":"İşletme kabul ettiği için atama değiştirilemez. Gerekirse işletmeyle iletişime geçin."}</div>`}</div>`;
    const b=d.querySelector(".dr-body");if(b)b.scrollTop=scroll;
  },
  on(type,e){
    if(type!=="click")return;
    const a=e.target.closest("[data-od]")?.dataset.od;
    if(a==="assign")openAssign($("drawer").dataset.id);
    if(e.target.closest("a[data-close]"))closeLayer($("drawer"));
  }
};

/* ===== ATAMA =====
   Uygun işletme: siparişin sitesine site_businesses ile AKTİF bağlı ve kendisi AKTİF işletmeler.
   Kategori-hizmet eşleşmesi kesin bilinmediğinden yalnızca uyarı olarak gösterilir. */
function categoryFits(b,service){
  const c=norm(b.category),s=norm(service);
  if(!c||!s)return null;
  return s.includes(c)||c.includes(s)||(c==="temizlik"&&/temizli|yikama/.test(s));
}
function openAssign(id){
  const o=orderById(id);if(!o)return;
  if(!canAssign(o)){toast("Bu sipariş yalnızca 'Beklemede' durumundayken atanabilir.","error");return}
  const eligible=linksOfSite(o.site_id).filter(l=>l.active).map(l=>bizById(l.business_id)).filter(b=>b&&b.active);
  const other=S.businesses.filter(b=>!eligible.includes(b));
  const m=modal({title:o.business_id==null?"Siparişi işletmeye ata":"Siparişi yeniden ata",
    sub:`${esc(o.order_code||"#"+o.id)} · ${esc(o.service||"")} · ${esc(siteName(o.site_id))}`,
    body:`${eligible.length?`<div class="checks" role="radiogroup" aria-label="İşletme">${eligible.map(b=>{const fit=categoryFits(b,o.service);return `<label class="check"><input type="radio" name="asg" value="${esc(b.id)}" ${same(b.id,o.business_id)?"checked":""}><span><b>${esc(b.name)}</b>${same(b.id,o.business_id)?' <span class="tag violet">Mevcut</span>':""}<small>${esc(b.category||"Kategori yok")}${fit===false?" · ⚠ kategori hizmetle eşleşmiyor olabilir":""}</small></span></label>`}).join("")}</div>`
        :`<div class="alert alert-warn">${ic("alert")}<div>Bu siteye bağlı <b>aktif</b> işletme yok. Önce <a href="#/sites/${esc(o.site_id)}" data-close>site sayfasından</a> işletme bağlayın.</div></div>`}
      ${other.length&&eligible.length?`<p class="field-help" style="margin-top:10px">Listede olmayan ${other.length} işletme bu siteye bağlı değil veya pasif.</p>`:""}
      ${propState(o)==="pending"&&o.business_id!=null?`<div class="alert alert-warn" style="margin-top:12px">${ic("clock")}<div>Bu siparişte mevcut işletmenin yanıt bekleyen bir saat önerisi var. Yeniden atamanın öneriyi nasıl etkileyeceği <code>admin_assign_order</code> fonksiyonunun içeriğine bağlıdır (bkz. sql/05).</div></div>`:""}
      <div class="field-err" id="asgErr" role="alert"></div>`,
    foot:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button><button class="btn btn-primary" type="button" id="asgOk" ${eligible.length?"":"disabled"}>Atamayı kaydet</button>`});
  m.querySelector("a[data-close]")?.addEventListener("click",()=>{closeLayer(m);closeLayer($("drawer"))});
  $("asgOk").onclick=async()=>{
    const v=m.querySelector("input[name=asg]:checked")?.value;
    if(!v){$("asgErr").textContent="Bir işletme seçin.";return}
    if(same(v,o.business_id)){$("asgErr").textContent="Sipariş zaten bu işletmeye atanmış.";return}
    const btn=$("asgOk");btn.disabled=true;btn.classList.add("loading");
    try{
      const{data,error}=await db.rpc("admin_assign_order",{p_order_id:Number(o.id),p_business_id:Number(v)});
      if(error){$("asgErr").textContent="Atama yapılamadı: "+error.message;return}
      if(data&&typeof data==="object"&&data.ok===false){$("asgErr").textContent="Atama yapılamadı: "+(data.message||data.error||"reddedildi");return}
      await loadAll(false);
      const now=orderById(o.id);
      if(!now||!same(now.business_id,v)){$("asgErr").textContent="Sunucu hata döndürmedi ama sipariş hâlâ eski işletmede görünüyor. Fonksiyonu kontrol edin (sql/00 çıktısı).";return}
      closeLayer(m);toast(`Sipariş ${bizName(v)} işletmesine atandı`);
    }catch(e){$("asgErr").textContent="Bağlantı hatası: "+(e.message||"")}
    finally{if(btn.isConnected){btn.disabled=false;btn.classList.remove("loading")}}
  };
}

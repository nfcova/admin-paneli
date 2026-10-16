/* =========================================================
   Siteler — liste, oluşturma/düzenleme, aktiflik, işletme eşleştirmeleri
   Yazılan alanlar mevcut admin panelinin kullandığı alanlarla sınırlıdır: sites(name, slug, address, active).
   Müşteri sitesi siteyi ?site=<slug> ile get_public_site RPC'sinden yükler.
========================================================= */
const SF={q:"",status:"",sort:"name",dir:"asc",page:1};
const SITE_KNOWN=["id","name","slug","address","active","created_at"];
const SLUG_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function slugify(v){return String(v||"").toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)}
const siteUrl=s=>CUSTOMER_SITE_URL+"?site="+encodeURIComponent(s.slug||"");
function siteStats(id){const os=S.orders.filter(o=>same(o.site_id,id));return {total:os.length,open:os.filter(o=>!CLOSED.includes(o.status)).length,unassigned:os.filter(o=>o.business_id==null&&!CLOSED.includes(o.status)).length,orders:os}}
const SITE_SORT={name:s=>lower(s.name),biz:s=>linksOfSite(s.id).filter(l=>l.active).length,orders:s=>siteStats(s.id).total,created:s=>s.created_at||""};

PAGES.sites={
  title:"Siteler",
  render(params){
    if(params[0]==="new"){queueMicrotask(()=>{if(route.page==="sites"&&route.params[0]==="new"){history.replaceState(null,"","#/sites");route.params=[];openSiteForm()}});return siteListHTML()}
    if(params[0])return siteDetailHTML(params[0]);
    return siteListHTML();
  },
  on(type,e){
    const t=e.target;
    if(route.params[0]){
      if(type!=="click")return;
      const s=siteById(route.params[0]);if(!s)return;
      const sw=t.closest("[data-slink]");if(sw){toggleLink(s.id,sw.dataset.slink);return}
      const a=t.closest("[data-sd]")?.dataset.sd;
      if(a==="edit")openSiteForm(s);
      if(a==="toggle")toggleSite(s);
      if(a==="add-biz")openLinkSites({site:s});
      if(a==="copy")navigator.clipboard?.writeText(siteUrl(s)).then(()=>toast("Bağlantı kopyalandı"),()=>toast("Kopyalanamadı","error"));
      if(a==="orders"){Object.assign(OF,{tab:"all",q:"",from:"",to:"",service:"",site:String(s.id),biz:"",flag:"",page:1});go("orders",["all"])}
      return;
    }
    if(type==="click"){
      const so=t.closest("[data-sort]");if(so){const k=so.dataset.sort;if(SF.sort===k)SF.dir=SF.dir==="asc"?"desc":"asc";else{SF.sort=k;SF.dir=k==="name"?"asc":"desc"}render();return}
      const p=t.closest("[data-page-key=sites]");if(p){SF.page=Number(p.dataset.pageTo);render();return}
      const row=t.closest("[data-site]");if(row){go("sites",[row.dataset.site]);return}
      const a=t.closest("[data-s]")?.dataset.s;
      if(a==="new")openSiteForm();
      if(a==="clear"){Object.assign(SF,{q:"",status:"",page:1});render()}
      return;
    }
    if(t.id==="sq"&&type==="input"){SF.q=t.value;SF.page=1;render()}
    if(t.id==="sStatus"&&type==="change"){SF.status=t.value;SF.page=1;render()}
  }
};
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches?.("tr[data-site]"))go("sites",[e.target.dataset.site])});

function siteListHTML(){
  const g=gate("sites","links");
  const q=lower(SF.q.trim());
  const list=applySort(S.sites.filter(s=>(!q||[s.name,s.slug,s.address].some(v=>lower(v).includes(q)))&&(!SF.status||(SF.status==="active")===!!s.active)),SF,SITE_SORT);
  const pg=paginate(list,SF.page),act=S.sites.filter(s=>s.active).length;
  return `
  <div class="page-head"><div><h1>Siteler</h1><p>${S.loaded?`${S.sites.length} site · ${act} aktif`:"Yükleniyor…"}</p></div>
    <div class="actions"><button class="btn btn-primary" type="button" data-s="new">${ic("plus")}Yeni site</button></div></div>
  <section class="card">
    <div class="toolbar"><label class="search">${ic("search")}<span class="sr">Site ara</span><input id="sq" type="search" placeholder="Ad, slug veya adres" value="${esc(SF.q)}" autocomplete="off"></label>
      <select class="select" id="sStatus" aria-label="Durum"><option value="">Tüm durumlar</option><option value="active" ${SF.status==="active"?"selected":""}>Aktif</option><option value="passive" ${SF.status==="passive"?"selected":""}>Pasif</option></select>
      ${SF.q||SF.status?`<button class="btn btn-ghost" type="button" data-s="clear">${ic("x")}Temizle</button>`:""}</div>
    ${g||(list.length?`<table class="tbl cards"><thead><tr>${sortHead("Site","name",SF)}<th class="hide-m">Adres</th>${sortHead("Aktif işletme","biz",SF,"r")}${sortHead("Sipariş","orders",SF,"r")}<th>Durum</th></tr></thead><tbody>
      ${pg.rows.map(s=>{const st=siteStats(s.id),bc=linksOfSite(s.id).filter(l=>l.active&&bizById(l.business_id)?.active).length;return `<tr class="click" data-site="${esc(s.id)}" tabindex="0">
        <td class="m-title"><b>${esc(s.name)}</b><small class="mono">?site=${esc(s.slug||"")}</small></td>
        <td class="hide-m m-hide"><span class="clip">${esc(s.address||"-")}</span></td>
        <td class="r" data-l="Aktif işletme">${bc?bc:'<span class="tag amber">0</span>'}</td>
        <td class="r" data-l="Sipariş">${st.total}${st.unassigned?` <span class="tag red">${st.unassigned} atanmamış</span>`:""}</td>
        <td class="m-top">${activeBadge(s.active)}</td></tr>`}).join("")}</tbody></table>${pagerHTML(pg,"sites")}`
      :SF.q||SF.status?emptyHTML("search","Sonuç bulunamadı","",`<button class="btn btn-secondary" type="button" data-s="clear">Filtreleri temizle</button>`)
      :emptyHTML("building","Henüz site yok","İlk siteyi ekleyin; müşteriler siteye özel bağlantıdan sipariş verir.",`<button class="btn btn-primary" type="button" data-s="new">${ic("plus")}Yeni site</button>`))}
  </section>`;
}

function siteDetailHTML(id){
  const g=gate("sites");if(g)return g;
  const s=siteById(id);
  if(!s)return `<button class="back" type="button" data-nav="sites">${ic("chev-l")}Siteler</button>`+emptyHTML("alert","Site bulunamadı","");
  const st=siteStats(s.id),links=linksOfSite(s.id),extra=Object.keys(s).filter(k=>!SITE_KNOWN.includes(k));
  /* Hizmet kapsamı: müşteri sitesindeki her hizmet için bu sitede kategori olarak eşleşebilecek aktif işletme var mı */
  const activeBiz=links.filter(l=>l.active).map(l=>bizById(l.business_id)).filter(b=>b&&b.active);
  const cover=Object.keys(SERVICE_CATALOG).map(sv=>({sv,biz:activeBiz.filter(b=>categoryFits(b,sv))}));
  return `
  <button class="back" type="button" data-nav="sites">${ic("chev-l")}Siteler</button>
  <div class="page-head"><div><h1>${esc(s.name)}</h1><p>${activeBadge(s.active)} · <span class="mono">?site=${esc(s.slug)}</span></p></div>
    <div class="actions"><a class="btn btn-secondary" href="${esc(siteUrl(s))}" target="_blank" rel="noopener">${ic("external")}Müşteri sitesini aç</a><button class="btn btn-secondary" type="button" data-sd="edit">${ic("edit")}Düzenle</button>
      <button class="btn ${s.active?"btn-danger-soft":"btn-primary"}" type="button" data-sd="toggle">${ic(s.active?"ban":"check-c")}${s.active?"Pasifleştir":"Aktifleştir"}</button></div></div>
  <div class="kpis">
    <button class="kpi" type="button" data-sd="orders"><div class="kpi-top">${ic("orders")}Toplam sipariş</div><div class="kpi-val">${st.total}</div><div class="kpi-sub">Açık <b>${st.open}</b></div></button>
    <div class="kpi"><div class="kpi-top">${ic("alert")}Atanmamış</div><div class="kpi-val">${st.unassigned}</div><div class="kpi-sub">Açık siparişler</div></div>
    <div class="kpi"><div class="kpi-top">${ic("store")}Aktif işletme</div><div class="kpi-val">${activeBiz.length}</div><div class="kpi-sub">${links.length} bağlantı</div></div>
    <div class="kpi"><div class="kpi-top">${ic("calendar")}Kayıt</div><div class="kpi-val" style="font-size:18px">${esc(dateTR(s.created_at))}</div><div class="kpi-sub">created_at</div></div>
  </div>
  <div class="grid-2">
    <div class="stack">
      <section class="card"><div class="card-head"><div><h2>Bu siteye hizmet veren işletmeler</h2><p>Kapalı bağlantılar atama listesinde görünmez</p></div><button class="btn btn-secondary btn-sm" type="button" data-sd="add-biz">${ic("plus")}İşletme bağla</button></div>
        ${links.length?links.map(l=>{const b=bizById(l.business_id);return `<div class="li"><div class="li-ic ${l.active&&b?.active?"violet":""}">${ic("store")}</div><div class="li-t"><b>${b?`<a href="#/businesses/${esc(b.id)}" style="text-decoration:none">${esc(b.name)}</a>`:"#"+esc(l.business_id)}</b><small>${esc(b?.category||"-")}${b&&!b.active?" · İşletme pasif":""} · ${l.active?"bağlantı aktif":"bağlantı kapalı"}</small></div><button class="switch" type="button" role="switch" aria-checked="${!!l.active}" aria-label="${esc((b?.name||"İşletme")+" bağlantısı")}" data-slink="${esc(l.business_id)}"></button></div>`}).join("")
          :emptyHTML("store","Bağlı işletme yok","Bu siteden gelen siparişler hiçbir işletmeye atanamaz.")}
      </section>
      <section class="card"><div class="card-head"><div><h2>Hizmet kapsamı</h2><p>Müşteri sitesindeki hizmetler × bu sitedeki aktif işletmelerin kategorisi</p></div></div>
        <table class="tbl"><thead><tr><th>Hizmet</th><th>Uygun işletme</th></tr></thead><tbody>${cover.map(c=>`<tr><td>${esc(c.sv)}</td><td>${c.biz.length?c.biz.map(b=>esc(b.name)).join(", "):'<span class="tag amber">Yok</span>'}</td></tr>`).join("")}</tbody></table>
        <div class="card-foot">Eşleşme, işletme kategorisinin hizmet adıyla benzerliğine göre tahmin edilir (ör. “Temizlik” → Ev Temizliği, Koltuk/Halı Yıkama). Siparişin gerçekte hangi işletmeye yönlendirildiği <code>create_public_order</code> fonksiyonuna bağlıdır.</div>
      </section>
    </div>
    <div class="stack">
      <section class="card"><div class="card-head"><h2>Site bilgileri</h2><button class="btn btn-ghost btn-sm" type="button" data-sd="edit">${ic("edit")}Düzenle</button></div>
        <dl class="dl"><dt>Ad</dt><dd>${esc(s.name)}</dd><dt>Slug</dt><dd class="mono">${esc(s.slug)}</dd><dt>Adres</dt><dd>${esc(s.address||"-")}</dd><dt>Durum</dt><dd>${activeBadge(s.active)}</dd>
        ${extra.map(k=>`<dt class="mono">${esc(k)}</dt><dd>${esc(typeof s[k]==="object"&&s[k]!==null?JSON.stringify(s[k]):s[k]??"-")}</dd>`).join("")}</dl>
        <div class="card-body" style="border-top:1px solid var(--line-2)"><div class="label">Müşteri bağlantısı</div><div style="display:flex;gap:8px;align-items:center"><input class="input mono" readonly value="${esc(siteUrl(s))}" aria-label="Müşteri bağlantısı"><button class="btn btn-secondary" type="button" data-sd="copy" aria-label="Bağlantıyı kopyala">${ic("copy")}</button></div></div>
      </section>
      ${historyCardHTML("site",s.id)}
    </div>
  </div>`;
}

function openSiteForm(s){
  const edit=!!s;
  const m=modal({title:edit?"Siteyi düzenle":"Yeni site",sub:edit?esc(s.name):"Müşteriler siteye özel bağlantıdan sipariş verir.",body:`
    <div class="field"><label class="label" for="stName">Site / apartman adı</label><input class="input" id="stName" value="${esc(s?.name||"")}" maxlength="120" autocomplete="off"><div class="field-err" id="stNameErr"></div></div>
    <div class="field"><label class="label" for="stSlug">Slug (bağlantı kodu)</label><input class="input mono" id="stSlug" value="${esc(s?.slug||"")}" maxlength="60" autocomplete="off" spellcheck="false">
      <div class="field-help" id="stSlugHelp">Küçük harf, rakam ve tire. Bağlantı: <span class="mono">${esc(CUSTOMER_SITE_URL)}?site=<b id="stSlugPrev">${esc(s?.slug||"…")}</b></span></div><div class="field-err" id="stSlugErr"></div></div>
    <div class="field"><label class="label" for="stAddr">Adres <span class="opt">(isteğe bağlı)</span></label><textarea class="textarea" id="stAddr" maxlength="300">${esc(s?.address||"")}</textarea></div>
    ${edit?`<div class="alert alert-warn">${ic("alert")}<div>Slug değiştirilirse sakinlerin elindeki eski bağlantı (<span class="mono">?site=${esc(s.slug)}</span>) çalışmaz ve tarayıcılarında kayıtlı sipariş takibi slug'a bağlı olduğu için görünmeyebilir.</div></div>`:""}
    <div class="field-err" id="stErr" role="alert"></div>`,
    foot:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button><button class="btn btn-primary" type="button" id="stOk">${edit?"Kaydet":"Siteyi oluştur"}</button>`});
  let slugTouched=edit;
  $("stName").addEventListener("input",()=>{if(!slugTouched){$("stSlug").value=slugify($("stName").value);$("stSlugPrev").textContent=$("stSlug").value||"…"}});
  $("stSlug").addEventListener("input",()=>{slugTouched=true;$("stSlugPrev").textContent=$("stSlug").value||"…"});
  $("stOk").onclick=async()=>{
    const v={name:$("stName").value.trim(),slug:$("stSlug").value.trim().toLowerCase(),address:$("stAddr").value.trim()||null};
    ["stNameErr","stSlugErr","stErr"].forEach(i=>$(i).textContent="");
    let bad=false;
    if(v.name.length<2){$("stNameErr").textContent="Site adı en az 2 karakter olmalı.";bad=true}
    else if(S.sites.some(x=>!same(x.id,s?.id)&&norm(x.name)===norm(v.name))){$("stNameErr").textContent="Bu adla kayıtlı bir site zaten var.";bad=true}
    if(!SLUG_RE.test(v.slug)){$("stSlugErr").textContent="Slug yalnızca küçük harf, rakam ve tek tire içerebilir (ör. nova-residence).";bad=true}
    else if(S.sites.some(x=>!same(x.id,s?.id)&&x.slug===v.slug)){$("stSlugErr").textContent="Bu slug başka bir sitede kullanılıyor.";bad=true}
    if(bad)return;
    const doSave=async()=>{
      const btn=$("stOk");btn.disabled=true;btn.classList.add("loading");
      let r;
      if(edit){
        const patch={};["name","slug","address"].forEach(k=>{if((s[k]??null)!==(v[k]??null))patch[k]=v[k]});
        if(!Object.keys(patch).length){closeLayer(m);return}
        r=await write(db.from("sites").update(patch).eq("id",s.id),{ok:"Site güncellendi",err:"Site güncellenemedi"});
      }else r=await write(db.from("sites").insert({...v,active:true}),{ok:"Site oluşturuldu",err:"Site oluşturulamadı"});
      if(btn.isConnected){btn.disabled=false;btn.classList.remove("loading")}
      if(r.r==="error"){$("stErr").textContent=/duplicate|unique/i.test(r.error?.message||"")?"Bu slug veya ad zaten kullanılıyor.":(r.error?.message||"Kaydedilemedi");return}
      closeLayer(m);
      if(!edit&&r.data?.[0]?.id!=null)go("sites",[String(r.data[0].id)]);
    };
    if(edit&&v.slug!==s.slug&&!m.dataset.slugOk){m.dataset.slugOk="1";$("stErr").textContent="Slug değişiyor. Eski müşteri bağlantıları çalışmayacak. Onaylıyorsanız tekrar “Kaydet”e basın.";return}
    doSave();
  };
}
function toggleSite(s){
  const st=siteStats(s.id);
  confirmDialog({title:s.active?"Siteyi pasifleştir":"Siteyi aktifleştir",
    text:s.active?`<b>${esc(s.name)}</b> pasifleştirildiğinde müşteri sitesinin bu siteyi nasıl ele alacağı <code>get_public_site</code> fonksiyonuna bağlıdır (muhtemelen yeni sipariş alınamaz).${st.open?` <br><br>Bu sitede <b>${st.open} açık sipariş</b> var; etkilenmezler.`:""}`:`<b>${esc(s.name)}</b> yeniden sipariş alabilir hale gelecek.`,
    label:s.active?"Pasifleştir":"Aktifleştir",cls:s.active?"btn-danger":"btn-primary",typed:s.active?s.slug:undefined,
    cb:async()=>(await write(db.from("sites").update({active:!s.active}).eq("id",s.id),{ok:s.active?"Site pasifleştirildi":"Site aktifleştirildi",err:"Durum değiştirilemedi"})).r});
}

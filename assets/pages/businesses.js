/* =========================================================
   İşletmeler — liste, detay, düzenleme, site eşleştirme, hesaplar ve ekleme sihirbazı
   Yazılan alanlar mevcut admin panelinin zaten kullandığı alanlarla sınırlıdır:
   businesses(name, email, phone, category, active), site_businesses(site_id, business_id, active).
========================================================= */
const BF={q:"",status:"",category:"",site:"",sort:"name",dir:"asc",page:1};
const BIZ_EDITABLE=["name","category","phone","email"];
/* Ekranda adıyla gösterilen bilinen sütunlar; diğer sütunlar "Diğer alanlar" altında salt okunur listelenir */
const BIZ_KNOWN=["id","name","category","phone","email","active","created_at"];
const accCache={};

function bizStats(id){
  const os=S.orders.filter(o=>same(o.business_id,id));
  return {total:os.length,open:os.filter(o=>!CLOSED.includes(o.status)).length,pending:os.filter(o=>o.status==="Beklemede").length,done:os.filter(o=>o.status==="Tamamlandı").length,orders:os};
}
const BIZ_SORT={name:b=>lower(b.name),category:b=>lower(b.category),sites:b=>linksOfBiz(b.id).filter(l=>l.active).length,orders:b=>bizStats(b.id).total,open:b=>bizStats(b.id).open,created:b=>b.created_at||""};
/* Mükerrer kayıt denetimi: ad (normalize), telefon (rakamlar), e-posta (küçük harf) */
function bizDuplicates({name,phone,email},exceptId){
  const n=norm(name),p=phoneDigits(phone).slice(-10),e=lower(email).trim();
  const others=S.businesses.filter(b=>!same(b.id,exceptId));
  return {
    name:n?others.filter(b=>norm(b.name)===n):[],
    phone:p.length>=10?others.filter(b=>phoneDigits(b.phone).slice(-10)===p):[],
    email:e?others.filter(b=>lower(b.email).trim()===e):[]
  };
}
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const validPhone=v=>{const d=phoneDigits(v);return d.length>=10&&d.length<=13};

PAGES.businesses={
  title:"İşletmeler",
  render(params){
    if(params[0]==="new"){queueMicrotask(()=>{if(route.page==="businesses"&&route.params[0]==="new"){history.replaceState(null,"","#/businesses");route.params=[];openWizard()}});return listHTML()}
    if(params[0])return detailHTML(params[0]);
    return listHTML();
  },
  on(type,e){
    const t=e.target;
    if(route.params[0])return detailOn(type,e);
    if(type==="click"){
      const s=t.closest("[data-sort]");if(s){const k=s.dataset.sort;if(BF.sort===k)BF.dir=BF.dir==="asc"?"desc":"asc";else{BF.sort=k;BF.dir=k==="name"||k==="category"?"asc":"desc"}render();return}
      const p=t.closest("[data-page-key=biz]");if(p){BF.page=Number(p.dataset.pageTo);render();return}
      const row=t.closest("[data-biz]");if(row){go("businesses",[row.dataset.biz]);return}
      const a=t.closest("[data-b]")?.dataset.b;
      if(a==="new")openWizard();
      if(a==="clear"){Object.assign(BF,{q:"",status:"",category:"",site:"",page:1});render()}
      if(a==="csv")exportBizCSV();
      return;
    }
    const map={bq:"q",bStatus:"status",bCat:"category",bSite:"site"};
    if(map[t.id]&&(type==="input"?t.id==="bq":true)){BF[map[t.id]]=t.value;BF.page=1;render()}
  }
};
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches?.("tr[data-biz]"))go("businesses",[e.target.dataset.biz])});

function filteredBiz(){
  const q=lower(BF.q.trim()),qd=q.replace(/\D/g,"");
  return applySort(S.businesses.filter(b=>{
    if(q&&![b.name,b.category,b.email].some(v=>lower(v).includes(q))&&!(qd.length>=3&&phoneDigits(b.phone).includes(qd)))return false;
    if(BF.status==="active"&&!b.active)return false;
    if(BF.status==="passive"&&b.active)return false;
    if(BF.category&&b.category!==BF.category)return false;
    if(BF.site==="none"){if(linksOfBiz(b.id).some(l=>l.active))return false}
    else if(BF.site&&!linksOfBiz(b.id).some(l=>l.active&&same(l.site_id,BF.site)))return false;
    return true;
  }),BF,BIZ_SORT);
}
function listHTML(){
  const g=gate("businesses","links");
  const list=filteredBiz(),pg=paginate(list,BF.page);
  const opt=(v,l,c)=>`<option value="${esc(v)}" ${String(c)===String(v)?"selected":""}>${esc(l)}</option>`;
  const filtered=BF.q||BF.status||BF.category||BF.site;
  const act=S.businesses.filter(b=>b.active).length;
  return `
  <div class="page-head"><div><h1>İşletmeler</h1><p>${S.loaded?`${S.businesses.length} işletme · ${act} aktif · ${S.businesses.length-act} pasif`:"Yükleniyor…"}</p></div>
    <div class="actions"><button class="btn btn-secondary" type="button" data-b="csv" ${S.businesses.length?"":"disabled"}>${ic("download")}CSV</button><button class="btn btn-primary" type="button" data-b="new">${ic("plus")}Yeni işletme</button></div></div>
  <section class="card">
    <div class="toolbar">
      <label class="search">${ic("search")}<span class="sr">İşletme ara</span><input id="bq" type="search" placeholder="Ad, kategori, telefon veya e-posta" value="${esc(BF.q)}" autocomplete="off"></label>
      <select class="select" id="bStatus" aria-label="Durum">${opt("","Tüm durumlar",BF.status)}${opt("active","Aktif",BF.status)}${opt("passive","Pasif",BF.status)}</select>
      <select class="select" id="bCat" aria-label="Kategori">${opt("","Tüm kategoriler",BF.category)}${categories().map(c=>opt(c,c,BF.category)).join("")}</select>
      <select class="select" id="bSite" aria-label="Site">${opt("","Tüm siteler",BF.site)}${opt("none","Hiçbir siteye bağlı değil",BF.site)}${S.sites.map(s=>opt(s.id,s.name,BF.site)).join("")}</select>
      ${filtered?`<button class="btn btn-ghost" type="button" data-b="clear">${ic("x")}Temizle</button>`:""}
    </div>
    ${g||(list.length?`<table class="tbl cards"><thead><tr>${sortHead("İşletme","name",BF)}${sortHead("Kategori","category",BF)}<th class="hide-m">İletişim</th>${sortHead("Siteler","sites",BF,"r")}${sortHead("Açık sipariş","open",BF,"r")}${sortHead("Toplam","orders",BF,"r")}<th>Durum</th></tr></thead><tbody>
      ${pg.rows.map(b=>{const st=bizStats(b.id),sc=linksOfBiz(b.id).filter(l=>l.active).length;return `<tr class="click" data-biz="${esc(b.id)}" tabindex="0">
        <td class="m-title"><b>${esc(b.name)}</b><small>${esc(b.created_at?"Kayıt "+dateTR(b.created_at):"")}</small></td>
        <td data-l="Kategori">${esc(b.category||"-")}</td>
        <td class="hide-m m-hide"><span class="clip">${esc(b.phone||"-")}</span><small class="clip">${esc(b.email||"")}</small></td>
        <td class="r" data-l="Siteler">${sc?sc:'<span class="tag amber">0</span>'}</td>
        <td class="r" data-l="Açık sipariş">${st.open}</td>
        <td class="r" data-l="Toplam sipariş">${st.total}</td>
        <td class="m-top">${activeBadge(b.active)}</td></tr>`}).join("")}
      </tbody></table>${pagerHTML(pg,"biz")}`
      :filtered?emptyHTML("search","Sonuç bulunamadı","Filtrelere uyan işletme yok.",`<button class="btn btn-secondary" type="button" data-b="clear">Filtreleri temizle</button>`)
      :emptyHTML("store","Henüz işletme yok","İlk işletmeyi ekleyerek başlayın.",`<button class="btn btn-primary" type="button" data-b="new">${ic("plus")}Yeni işletme</button>`))}
  </section>`;
}
function exportBizCSV(){
  const rows=filteredBiz().map(b=>{const st=bizStats(b.id);return [b.id,b.name,b.category,b.phone,b.email,b.active?"Aktif":"Pasif",linksOfBiz(b.id).filter(l=>l.active).map(l=>siteName(l.site_id)).join(", "),st.total,st.open,st.done,dateTR(b.created_at)]});
  downloadCSV(`baksana-isletmeler-${TODAY()}.csv`,[["ID","Ad","Kategori","Telefon","E-posta","Durum","Siteler","Toplam sipariş","Açık sipariş","Tamamlanan","Kayıt"],...rows]);
}

/* ===== DETAY ===== */
function detailHTML(id){
  const g=gate("businesses");if(g)return g;
  const b=bizById(id);
  if(!b)return `<button class="back" type="button" data-nav="businesses">${ic("chev-l")}İşletmeler</button>`+emptyHTML("alert","İşletme bulunamadı","Kayıt silinmiş olabilir veya erişiminiz yok.");
  const st=bizStats(b.id),links=linksOfBiz(b.id);
  const extra=Object.keys(b).filter(k=>!BIZ_KNOWN.includes(k));
  const recent=[...st.orders].slice(0,8);
  return `
  <button class="back" type="button" data-nav="businesses">${ic("chev-l")}İşletmeler</button>
  <div class="page-head"><div><h1>${esc(b.name)}</h1><p>${esc(b.category||"Kategori yok")} · ${activeBadge(b.active)} · ID <span class="mono">${esc(b.id)}</span></p></div>
    <div class="actions"><button class="btn btn-secondary" type="button" data-bd="edit">${ic("edit")}Düzenle</button>
    <button class="btn ${b.active?"btn-danger-soft":"btn-primary"}" type="button" data-bd="toggle">${ic(b.active?"ban":"check-c")}${b.active?"Pasifleştir":"Aktifleştir"}</button></div></div>
  <div class="kpis">
    <button class="kpi" type="button" data-bd="orders"><div class="kpi-top">${ic("orders")}Toplam sipariş</div><div class="kpi-val">${st.total}</div><div class="kpi-sub">Tamamlanan <b>${st.done}</b></div></button>
    <div class="kpi"><div class="kpi-top">${ic("inbox")}Açık sipariş</div><div class="kpi-val">${st.open}</div><div class="kpi-sub">Bekleyen <b>${st.pending}</b></div></div>
    <div class="kpi"><div class="kpi-top">${ic("building")}Hizmet verdiği site</div><div class="kpi-val">${links.filter(l=>l.active).length}</div><div class="kpi-sub">${links.length-links.filter(l=>l.active).length} pasif bağlantı</div></div>
    <div class="kpi"><div class="kpi-top">${ic("wallet")}Tamamlanan tutar</div><div class="kpi-val">${money(st.orders.filter(o=>o.status==="Tamamlandı"&&hasPrice(o)).reduce((a,o)=>a+Number(o.price),0))}</div><div class="kpi-sub">Sipariş fiyatlarından</div></div>
  </div>
  <div class="grid-2">
    <div class="stack">
      <section class="card"><div class="card-head"><h2>İşletme bilgileri</h2><button class="btn btn-ghost btn-sm" type="button" data-bd="edit">${ic("edit")}Düzenle</button></div>
        <dl class="dl"><dt>Ad</dt><dd>${esc(b.name)}</dd><dt>Kategori (hizmet)</dt><dd>${esc(b.category||"-")}</dd><dt>Telefon</dt><dd>${b.phone?`<a href="tel:${esc(phoneDigits(b.phone))}" style="color:var(--brand);font-weight:600;text-decoration:none">${esc(b.phone)}</a>`:"-"}</dd><dt>E-posta</dt><dd>${esc(b.email||"-")}</dd><dt>Durum</dt><dd>${activeBadge(b.active)}</dd><dt>Kayıt tarihi</dt><dd>${esc(stamp(b.created_at)||"-")}</dd>
        ${extra.map(k=>`<dt class="mono">${esc(k)}</dt><dd>${esc(typeof b[k]==="object"&&b[k]!==null?JSON.stringify(b[k]):b[k]??"-")}</dd>`).join("")}</dl>
        ${extra.length?`<div class="card-foot">Ek alanlar veritabanında mevcut ama panel tarafından düzenlenmiyor (salt okunur).</div>`:`<div class="card-foot">Adres alanı mevcut şemada bulunmuyor. Eklemek isterseniz KURULUM.md → “Opsiyonel” bölümüne bakın.</div>`}
      </section>
      <section class="card"><div class="card-head"><div><h2>Son siparişler</h2><p>Bu işletmeye atanmış</p></div>${st.total?`<button class="btn btn-ghost btn-sm" type="button" data-bd="orders">Tümü${ic("chev-r")}</button>`:""}</div>
        ${recent.length?recent.map(o=>`<button class="li" type="button" data-open-order="${esc(o.id)}"><div class="li-t"><b>${esc(o.service||"Hizmet")} · <span class="mono">${esc(o.order_code||"#"+o.id)}</span></b><small>${esc(siteName(o.site_id))} · ${esc(dateTR(o.service_date))} ${esc(effTime(o))}</small></div>${badge(o.status)}</button>`).join(""):emptyHTML("inbox","Henüz sipariş yok","")}
      </section>
    </div>
    <div class="stack">
      <section class="card"><div class="card-head"><div><h2>Hizmet verdiği siteler</h2><p>site_businesses</p></div><button class="btn btn-secondary btn-sm" type="button" data-bd="add-site">${ic("plus")}Site bağla</button></div>
        ${links.length?links.map(l=>{const s=siteById(l.site_id);return `<div class="li"><div class="li-ic ${l.active?"blue":""}">${ic("building")}</div><div class="li-t"><b>${s?`<a href="#/sites/${esc(s.id)}" style="text-decoration:none">${esc(s.name)}</a>`:"#"+esc(l.site_id)}</b><small>${s&&!s.active?"Site pasif · ":""}${l.active?"Bağlantı aktif":"Bağlantı pasif"}</small></div><button class="switch" type="button" role="switch" aria-checked="${!!l.active}" aria-label="${esc((s?.name||"Site")+" bağlantısı")}" data-link="${esc(l.site_id)}"></button></div>`}).join("")
          :emptyHTML("building","Hiçbir siteye bağlı değil","Bağlanmadığı sürece bu işletmeye sipariş atanamaz.")}
      </section>
      ${accountsCardHTML(b)}
      ${historyCardHTML("business",b.id)}
    </div>
  </div>`;
}
function detailOn(type,e){
  if(type!=="click")return;
  const t=e.target,b=bizById(route.params[0]);if(!b)return;
  const sw=t.closest("[data-link]");if(sw){toggleLink(sw.dataset.link,b.id);return}
  const a=t.closest("[data-bd]")?.dataset.bd;
  if(a==="edit")openBizEdit(b);
  if(a==="toggle")toggleBiz(b);
  if(a==="orders"){Object.assign(OF,{tab:"all",q:"",from:"",to:"",service:"",site:"",biz:String(b.id),flag:"",page:1});go("orders",["all"])}
  if(a==="add-site")openLinkSites({business:b});
  const acc=t.closest("[data-acc]");if(acc)accountAction(b,acc.dataset.acc,acc.dataset.uid,acc.dataset.email);
}

function openBizEdit(b){
  const cats=categories();
  const m=modal({title:"İşletmeyi düzenle",sub:esc(b.name),body:`
    <div class="form-grid">
      <div class="field full"><label class="label" for="eName">İşletme adı</label><input class="input" id="eName" value="${esc(b.name)}" maxlength="120"><div class="field-err" id="eNameErr"></div></div>
      <div class="field full"><label class="label" for="eCat">Kategori (sunduğu hizmet)</label><select class="select" id="eCat">${cats.map(c=>`<option ${c===b.category?"selected":""}>${esc(c)}</option>`).join("")}</select>
        <div class="field-help">Kategori, siparişlerin hangi işletmeye yönlendirileceğini etkileyebilir. Mevcut kategorisi olan işletmenin değerini değiştirmeden önce açık siparişleri kontrol edin.</div></div>
      <div class="field"><label class="label" for="ePhone">Telefon</label><input class="input" id="ePhone" type="tel" value="${esc(b.phone||"")}" inputmode="tel"><div class="field-err" id="ePhoneErr"></div></div>
      <div class="field"><label class="label" for="eEmail">E-posta</label><input class="input" id="eEmail" type="email" value="${esc(b.email||"")}"><div class="field-err" id="eEmailErr"></div></div>
    </div><div class="field-err" id="eErr" role="alert"></div>`,
    foot:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button><button class="btn btn-primary" type="button" id="eOk">Kaydet</button>`});
  $("eOk").onclick=async()=>{
    const v={name:$("eName").value.trim(),category:$("eCat").value,phone:$("ePhone").value.trim(),email:$("eEmail").value.trim()};
    ["eNameErr","ePhoneErr","eEmailErr","eErr"].forEach(i=>$(i).textContent="");
    let bad=false;
    if(v.name.length<2){$("eNameErr").textContent="İşletme adı en az 2 karakter olmalı.";bad=true}
    if(v.phone&&!validPhone(v.phone)){$("ePhoneErr").textContent="Geçerli bir telefon numarası girin.";bad=true}
    if(v.email&&!validEmail(v.email)){$("eEmailErr").textContent="Geçerli bir e-posta girin.";bad=true}
    const d=bizDuplicates(v,b.id);
    if(d.name.length){$("eNameErr").textContent=`Bu adla kayıtlı başka işletme var: ${d.name[0].name}`;bad=true}
    if(bad)return;
    const patch={};
    BIZ_EDITABLE.forEach(k=>{const nv=v[k]||null;if((b[k]??null)!==nv)patch[k]=k==="name"||k==="category"?v[k]:nv});
    if(!Object.keys(patch).length){closeLayer(m);return}
    if((d.phone.length||d.email.length)&&!m.dataset.dupOk){m.dataset.dupOk="1";$("eErr").textContent=`Uyarı: ${d.phone.length?"telefon":"e-posta"} başka bir işletmede de kayıtlı (${(d.phone[0]||d.email[0]).name}). Yine de kaydetmek için tekrar “Kaydet”e basın.`;return}
    const btn=$("eOk");btn.disabled=true;btn.classList.add("loading");
    const r=await write(db.from("businesses").update(patch).eq("id",b.id),{ok:"İşletme bilgileri güncellendi",err:"Güncellenemedi"});
    btn.disabled=false;btn.classList.remove("loading");
    if(r.r!=="error")closeLayer(m);else $("eErr").textContent=r.error?.message||"Güncellenemedi";
  };
}
function toggleBiz(b){
  const st=bizStats(b.id);
  confirmDialog({
    title:b.active?"İşletmeyi pasifleştir":"İşletmeyi aktifleştir",
    text:b.active?`<b>${esc(b.name)}</b> pasifleştirildiğinde işletme paneline giriş yapamaz (işletme paneli <code>active</code> alanını kontrol ediyor).${st.open?` <br><br><b>${st.open} açık siparişi</b> var; bunlar otomatik olarak başka işletmeye aktarılmaz.`:""}`:`<b>${esc(b.name)}</b> yeniden işletme paneline giriş yapabilecek.`,
    label:b.active?"Pasifleştir":"Aktifleştir",cls:b.active?"btn-danger":"btn-primary",
    cb:async()=>(await write(db.from("businesses").update({active:!b.active}).eq("id",b.id),{ok:b.active?"İşletme pasifleştirildi":"İşletme aktifleştirildi",err:"Durum değiştirilemedi"})).r
  });
}
/* Bağlantı aç/kapat: kayıt silinmez, active alanı değişir */
function toggleLink(siteId,bizId){
  const l=S.links.find(x=>same(x.site_id,siteId)&&same(x.business_id,bizId));if(!l)return;
  const s=siteById(siteId),b=bizById(bizId);
  const open=S.orders.filter(o=>same(o.site_id,siteId)&&same(o.business_id,bizId)&&!CLOSED.includes(o.status)).length;
  confirmDialog({
    title:l.active?"Site bağlantısını kapat":"Site bağlantısını aç",
    text:l.active?`<b>${esc(b?.name)}</b> artık <b>${esc(s?.name)}</b> sitesinden yeni sipariş almayacak (atama ekranında listelenmez).${open?` Bu sitedeki <b>${open} açık siparişi</b> etkilenmez.`:""}`:`<b>${esc(b?.name)}</b>, <b>${esc(s?.name)}</b> sitesine yeniden hizmet verebilecek.`,
    label:l.active?"Bağlantıyı kapat":"Bağlantıyı aç",cls:l.active?"btn-danger":"btn-primary",
    cb:async()=>{
      const q=l.id!=null?db.from("site_businesses").update({active:!l.active}).eq("id",l.id):db.from("site_businesses").update({active:!l.active}).eq("site_id",siteId).eq("business_id",bizId);
      return (await write(q,{ok:l.active?"Bağlantı kapatıldı":"Bağlantı açıldı",err:"Bağlantı güncellenemedi"})).r;
    }
  });
}
/* Çoklu site ↔ işletme bağlama (her iki yönden de kullanılır) */
function openLinkSites({business,site}){
  const items=business?S.sites.map(s=>({id:s.id,name:s.name,sub:s.active?(s.address||""):"Site pasif",linked:linksOfBiz(business.id).some(l=>same(l.site_id,s.id)&&l.active)}))
    :S.businesses.map(b=>({id:b.id,name:b.name,sub:(b.category||"")+(b.active?"":" · Pasif"),linked:linksOfSite(site.id).some(l=>same(l.business_id,b.id)&&l.active)}));
  const avail=items.filter(i=>!i.linked);
  const m=modal({title:business?"Siteye bağla":"İşletme bağla",sub:esc(business?business.name:site.name),body:
    avail.length?`<div class="checks">${avail.map(i=>`<label class="check"><input type="checkbox" value="${esc(i.id)}"><span><b>${esc(i.name)}</b><small>${esc(i.sub)}</small></span></label>`).join("")}</div><div class="field-err" id="lkErr" role="alert"></div>`
    :emptyHTML("check-c","Bağlanabilecek kayıt yok",business?"İşletme tüm sitelere zaten bağlı.":"Tüm işletmeler bu siteye zaten bağlı."),
    foot:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button>${avail.length?`<button class="btn btn-primary" type="button" id="lkOk">Bağla</button>`:""}`});
  if(!avail.length)return;
  $("lkOk").onclick=async()=>{
    const ids=[...m.querySelectorAll("input:checked")].map(x=>x.value);
    if(!ids.length){$("lkErr").textContent="En az bir kayıt seçin.";return}
    const rows=ids.map(id=>business?{site_id:Number(id),business_id:Number(business.id),active:true}:{site_id:Number(site.id),business_id:Number(id),active:true});
    const btn=$("lkOk");btn.disabled=true;btn.classList.add("loading");
    const r=await write(db.from("site_businesses").upsert(rows,{onConflict:"site_id,business_id"}),{ok:`${rows.length} bağlantı kaydedildi`,err:"Bağlantı kaydedilemedi",expect:rows.length});
    btn.disabled=false;btn.classList.remove("loading");
    if(r.r!=="error")closeLayer(m);else $("lkErr").textContent=r.error?.message||"Kaydedilemedi";
  };
}

/* ===== HESAPLAR (Edge Function) ===== */
function accountsCardHTML(b){
  const head=`<div class="card-head"><div><h2>Giriş hesapları</h2><p>İşletme paneline giriş yapan kullanıcılar</p></div>${S.infra.accountFn?`<div class="tags"><button class="btn btn-secondary btn-sm" type="button" data-acc="link">${ic("link")}Mevcut kullanıcı</button><button class="btn btn-primary btn-sm" type="button" data-acc="create">${ic("user-plus")}Yeni hesap</button></div>`:""}</div>`;
  if(S.infra.accountFn===null)return `<section class="card">${head}${skeletonRows(1)}</section>`;
  if(!S.infra.accountFn)return `<section class="card">${head}<div class="card-body"><div class="alert alert-warn">${ic("info")}<div><b>Hesap servisi kurulu değil.</b> Hesap oluşturma ve bağlama, service-role anahtarını tarayıcıya vermeden yalnızca sunucu tarafında yapılabilir. KURULUM.md → Adım 4'teki <code>${ACCOUNT_FN}</code> Edge Function'ını dağıttıktan sonra bu bölüm etkinleşir.</div></div></div></section>`;
  const c=accCache[b.id];
  if(!c||c.stale){if(!c?.loading)loadAccounts(b.id);return `<section class="card">${head}${skeletonRows(2)}</section>`}
  if(c.loading&&!c.users)return `<section class="card">${head}${skeletonRows(2)}</section>`;
  if(c.error)return `<section class="card">${head}<div class="card-body"><div class="alert alert-error">${ic("alert")}<div>${esc(c.error)}</div></div><button class="btn btn-secondary btn-sm" style="margin-top:10px" type="button" data-acc="reload">${ic("refresh")}Tekrar dene</button></div></section>`;
  return `<section class="card">${head}${c.users.length?c.users.map(u=>`<div class="li"><div class="li-ic ${u.banned?"red":"violet"}">${ic("user")}</div><div class="li-t"><b>${esc(u.email||u.id)}</b><small>${u.banned?"Girişi askıya alındı":u.last_sign_in_at?"Son giriş "+esc(ago(u.last_sign_in_at)):u.invited?"Davet gönderildi, henüz giriş yok":"Henüz giriş yapmadı"}${u.full_name?" · "+esc(u.full_name):""}</small></div>
    <div class="tags"><button class="btn btn-ghost btn-sm" type="button" data-acc="${u.banned?"unsuspend":"suspend"}" data-uid="${esc(u.id)}" data-email="${esc(u.email||"")}">${u.banned?"Askıyı kaldır":"Askıya al"}</button><button class="btn btn-danger-soft btn-sm" type="button" data-acc="unlink" data-uid="${esc(u.id)}" data-email="${esc(u.email||"")}" aria-label="Bağlantıyı kaldır">${ic("unlink")}</button></div></div>`).join("")
    :emptyHTML("user","Bağlı hesap yok","Bu işletme panele giriş yapamaz. Yeni hesap oluşturun veya mevcut bir kullanıcıyı bağlayın.")}</section>`;
}
async function loadAccounts(bizId){
  accCache[bizId]={...(accCache[bizId]||{}),loading:true,stale:false};
  try{const r=await callAccountFn({action:"list",business_id:bizId});accCache[bizId]={users:r.users||[],loading:false}}
  catch(e){accCache[bizId]={error:e.message,loading:false,users:null}}
  if(route.page==="businesses"&&same(route.params[0],bizId))render();
}
function accountAction(b,act,uid,email){
  if(act==="reload"){accCache[b.id]={stale:true};render();return}
  if(act==="create"||act==="link")return openAccountModal(b,act);
  const labels={unlink:["Hesap bağlantısını kaldır",`<b>${esc(email)}</b> artık <b>${esc(b.name)}</b> işletme paneline giriş yapamayacak. Kullanıcı hesabı silinmez; profildeki işletme bağlantısı ve işletme rolü kaldırılır.`,"Bağlantıyı kaldır","btn-danger"],
    suspend:["Girişi askıya al",`<b>${esc(email)}</b> askı kaldırılana kadar hiçbir şekilde giriş yapamaz.`,"Askıya al","btn-danger"],
    unsuspend:["Askıyı kaldır",`<b>${esc(email)}</b> yeniden giriş yapabilecek.`,"Askıyı kaldır","btn-primary"]}[act];
  if(!labels)return;
  confirmDialog({title:labels[0],text:labels[1],label:labels[2],cls:labels[3],typed:act==="unlink"?"KALDIR":undefined,cb:async()=>{
    try{await callAccountFn({action:act,business_id:b.id,user_id:uid});toast(labels[2]+" işlemi tamamlandı");accCache[b.id]={stale:true};render();return "ok"}
    catch(e){toast(e.message,"error");return "error"}
  }});
}
function genPassword(){const a="abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";const r=new Uint32Array(14);crypto.getRandomValues(r);return Array.from(r,x=>a[x%a.length]).join("")}
function accountFormHTML(mode,prefix="ac"){
  return mode==="link"?`<div class="field"><label class="label" for="${prefix}Email">Kullanıcının e-postası</label><input class="input" id="${prefix}Email" type="email" autocomplete="off"><div class="field-help">Kullanıcı Supabase Auth'ta zaten kayıtlı olmalı. Başka bir işletmeye veya admin rolüne bağlıysa işlem sunucu tarafında reddedilir.</div></div>`
    :`<div class="field"><label class="label" for="${prefix}Email">Giriş e-postası</label><input class="input" id="${prefix}Email" type="email" autocomplete="off"></div>
      <div class="field"><label class="label" for="${prefix}Name">Yetkili adı <span class="opt">(isteğe bağlı)</span></label><input class="input" id="${prefix}Name" autocomplete="off" maxlength="120"></div>
      <fieldset class="field" style="border:0"><legend class="label">Şifre belirleme</legend><div class="checks">
        <label class="check"><input type="radio" name="${prefix}Mode" value="invite" checked><span><b>Davet e-postası gönder</b><small>Kullanıcı şifresini kendisi belirler. Supabase e-posta ayarlarının yapılmış olması gerekir.</small></span></label>
        <label class="check"><input type="radio" name="${prefix}Mode" value="password"><span><b>Geçici şifre oluştur</b><small>Şifre yalnızca bir kez gösterilir ve hiçbir yerde saklanmaz. Güvenli bir kanalla iletin.</small></span></label>
      </div></fieldset>`;
}
function readAccountForm(mode,prefix="ac"){
  const email=$(prefix+"Email").value.trim();
  if(!validEmail(email))return {err:"Geçerli bir e-posta girin."};
  if(mode==="link")return {action:"link",email};
  const how=document.querySelector(`input[name=${prefix}Mode]:checked`)?.value||"invite";
  return how==="password"?{action:"create",email,full_name:$(prefix+"Name").value.trim()||null,password:genPassword()}:{action:"invite",email,full_name:$(prefix+"Name").value.trim()||null};
}
function openAccountModal(b,mode){
  const m=modal({title:mode==="link"?"Mevcut kullanıcıyı bağla":"Yeni giriş hesabı",sub:esc(b.name),body:accountFormHTML(mode)+`<div class="field-err" id="acErr" role="alert"></div>`,
    foot:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button><button class="btn btn-primary" type="button" id="acOk">${mode==="link"?"Bağla":"Hesabı oluştur"}</button>`});
  $("acOk").onclick=async()=>{
    const f=readAccountForm(mode);if(f.err){$("acErr").textContent=f.err;return}
    const btn=$("acOk");btn.disabled=true;btn.classList.add("loading");
    try{
      await callAccountFn({...f,business_id:b.id});
      accCache[b.id]={stale:true};
      if(f.password)showPasswordOnce(f.email,f.password);else{closeLayer(m);toast(f.action==="invite"?"Davet e-postası gönderildi":"Kullanıcı işletmeye bağlandı")}
      render();
    }catch(e){$("acErr").textContent=e.message}
    finally{if(btn.isConnected){btn.disabled=false;btn.classList.remove("loading")}}
  };
}
function showPasswordOnce(email,pw){
  modal({title:"Hesap oluşturuldu",sub:"Bu şifre bir daha gösterilmeyecek.",body:`<dl class="kv"><dt>E-posta</dt><dd>${esc(email)}</dd><dt>Geçici şifre</dt><dd><span class="mono" id="pwOnce">${esc(pw)}</span> <button class="btn btn-ghost btn-sm" type="button" id="pwCopy">${ic("copy")}Kopyala</button></dd></dl><div class="alert alert-warn" style="margin-top:12px">${ic("shield")}<div>Şifreyi güvenli bir kanalla iletin ve kullanıcıdan ilk girişte değiştirmesini isteyin.</div></div>`,
    foot:`<button class="btn btn-primary" type="button" data-close>Kaydettim, kapat</button>`});
  $("pwCopy").onclick=()=>navigator.clipboard?.writeText(pw).then(()=>toast("Şifre kopyalandı"),()=>toast("Kopyalanamadı; şifreyi elle seçin","error"));
}

/* ===== SİHİRBAZ ===== */
const WSTEPS=["Temel bilgiler","İletişim","Hizmet","Siteler","Giriş hesabı","Özet"];
let W=null;
function openWizard(){
  W={step:0,name:"",category:"",phone:"",email:"",sites:new Set(),acc:"none",accEmail:"",accName:"",accHow:"invite",dupOk:false,done:null};
  const m=$("genModal");
  Object.keys(m.dataset).forEach(k=>delete m.dataset[k]);
  m.querySelector(".modal-box").classList.add("wide");
  openLayer(m);
  drawWizard();
}
function drawWizard(){
  const m=$("genModal"),box=m.querySelector(".modal-box");
  if(W.done)return drawWizardResult();
  const s=W.step,cats=categories();
  const d=bizDuplicates({name:W.name,phone:W.phone,email:W.email});
  let body="";
  if(s===0)body=`<div class="field"><label class="label" for="wName">İşletme adı</label><input class="input" id="wName" value="${esc(W.name)}" maxlength="120" autocomplete="off" data-autofocus><div class="field-err" id="wNameErr">${d.name.length?`Bu adla kayıtlı bir işletme var: <a href="#/businesses/${esc(d.name[0].id)}">${esc(d.name[0].name)}</a>. Aynı işletmeyi tekrar eklemeyin.`:""}</div><div class="field-help">Müşterilere ve işletme panelinde görünen ad.</div></div>
    <div class="note">${ic("info")}<div>Mevcut şemada işletme için <b>ad, kategori, telefon, e-posta ve aktiflik</b> alanları kullanılıyor. Adres gibi ek alanlar yok; uydurulmuş alan yazılmaz.</div></div>`;
  if(s===1)body=`<div class="form-grid"><div class="field"><label class="label" for="wPhone">Telefon</label><input class="input" id="wPhone" type="tel" inputmode="tel" value="${esc(W.phone)}" placeholder="05xx xxx xx xx"><div class="field-err" id="wPhoneErr"></div></div>
    <div class="field"><label class="label" for="wEmail">E-posta <span class="opt">(iletişim)</span></label><input class="input" id="wEmail" type="email" value="${esc(W.email)}"><div class="field-err" id="wEmailErr"></div></div></div>
    ${d.phone.length||d.email.length?`<div class="alert alert-warn">${ic("alert")}<div>${d.phone.length?`Bu telefon <b>${esc(d.phone[0].name)}</b> işletmesinde kayıtlı. `:""}${d.email.length?`Bu e-posta <b>${esc(d.email[0].name)}</b> işletmesinde kayıtlı.`:""}<label style="display:flex;gap:8px;margin-top:8px;align-items:center"><input type="checkbox" id="wDupOk" ${W.dupOk?"checked":""}> Farklı bir işletme olduğunu doğruluyorum</label></div></div>`:""}`;
  if(s===2)body=`<fieldset style="border:0"><legend class="label">İşletmenin sunduğu hizmet (kategori)</legend><div class="checks two">${cats.map(c=>`<label class="check"><input type="radio" name="wCat" value="${esc(c)}" ${W.category===c?"checked":""}><span><b>${esc(c)}</b><small>${S.businesses.filter(b=>b.category===c).length} işletme</small></span></label>`).join("")}</div></fieldset><div class="field-err" id="wCatErr"></div>
    <div class="note" style="margin-top:12px">${ic("info")}<div>Mevcut şemada işletme başına <b>tek kategori</b> (<code>businesses.category</code>) var. Kategori adları mevcut kayıtlarla aynı tutuldu çünkü siparişin işletmeye yönlendirilmesi bu değere bağlı olabilir. Müşteri sitesindeki hizmetler: ${Object.keys(SERVICE_CATALOG).map(esc).join(", ")}.</div></div>`;
  if(s===3)body=S.sites.length?`<p class="field-help" style="margin:0 0 10px">İşletme seçilen sitelerdeki siparişlere atanabilir. Daha sonra da değiştirilebilir.</p><div class="checks two">${S.sites.map(x=>`<label class="check ${x.active?"":"disabled"}"><input type="checkbox" value="${esc(x.id)}" data-wsite ${W.sites.has(String(x.id))?"checked":""}><span><b>${esc(x.name)}</b><small>${x.active?esc(x.address||x.slug||""):"Pasif site"}</small></span></label>`).join("")}</div>`:emptyHTML("building","Henüz site yok","İşletmeyi şimdi oluşturup siteleri daha sonra bağlayabilirsiniz.");
  if(s===4){
    const fn=S.infra.accountFn;
    body=`<fieldset style="border:0"><legend class="label">İşletme paneli giriş hesabı</legend><div class="checks">
      <label class="check"><input type="radio" name="wAcc" value="none" ${W.acc==="none"?"checked":""}><span><b>Şimdilik hesap oluşturma</b><small>İşletme kaydı oluşturulur; hesap daha sonra detay sayfasından eklenebilir.</small></span></label>
      <label class="check ${fn?"":"disabled"}"><input type="radio" name="wAcc" value="create" ${W.acc==="create"?"checked":""} ${fn?"":"disabled"}><span><b>Yeni hesap oluştur</b><small>${fn?"Davet e-postası veya geçici şifre ile.":"Hesap servisi (Edge Function) kurulu değil."}</small></span></label>
      <label class="check ${fn?"":"disabled"}"><input type="radio" name="wAcc" value="link" ${W.acc==="link"?"checked":""} ${fn?"":"disabled"}><span><b>Mevcut kullanıcıyı bağla</b><small>${fn?"Supabase Auth'ta kayıtlı bir e-posta.":"Hesap servisi (Edge Function) kurulu değil."}</small></span></label>
    </div></fieldset>
    ${W.acc!=="none"?`<div id="wAccForm" style="margin-top:12px">${accountFormHTML(W.acc==="link"?"link":"create","wa")}</div>`:""}<div class="field-err" id="wAccErr"></div>
    <div class="note" style="margin-top:12px">${ic("shield")}<div>İşletme kaydı ile giriş hesabı ayrı işlemlerdir. Hesap işlemi başarısız olursa işletme kaydı korunur ve detay sayfasından tekrar denenebilir.</div></div>`;
  }
  if(s===5){
    const sites=[...W.sites].map(id=>siteName(id));
    body=`<div class="summary"><dl class="dl"><dt>İşletme adı</dt><dd>${esc(W.name)}</dd><dt>Kategori</dt><dd>${esc(W.category)}</dd><dt>Telefon</dt><dd>${esc(W.phone||"-")}</dd><dt>E-posta</dt><dd>${esc(W.email||"-")}</dd><dt>Siteler</dt><dd>${sites.length?sites.map(esc).join(", "):'<span class="muted">Bağlanmayacak</span>'}</dd><dt>Giriş hesabı</dt><dd>${W.acc==="none"?'<span class="muted">Oluşturulmayacak</span>':W.acc==="link"?"Mevcut kullanıcı bağlanacak: "+esc(W.accEmail):(W.accHow==="password"?"Geçici şifreli hesap: ":"Davet gönderilecek: ")+esc(W.accEmail)}</dd><dt>Durum</dt><dd>${activeBadge(true)}</dd></dl></div>
      <p class="field-help" style="margin-top:10px">Kaydet'e bastığınızda sırasıyla işletme kaydı, site bağlantıları ve (seçildiyse) giriş hesabı oluşturulur. Her adımın sonucu ayrı ayrı gösterilir.</p>`;
  }
  box.innerHTML=`
    <div class="modal-h"><div class="t"><h2 id="wizT">Yeni işletme</h2><p>Adım ${s+1}/${WSTEPS.length} · ${WSTEPS[s]}</p></div><button class="icon-btn" type="button" data-close aria-label="Kapat">${ic("x")}</button></div>
    <ol class="steps" aria-hidden="true">${WSTEPS.map((t,i)=>`<li class="${i<s?"done":i===s?"cur":""}"><span></span><small>${t}</small></li>`).join("")}</ol>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${s?`<button class="btn btn-secondary" type="button" id="wBack">${ic("chev-l")}Geri</button>`:`<button class="btn btn-secondary" type="button" data-close>Vazgeç</button>`}<span class="spacer"></span>
      <button class="btn btn-primary" type="button" id="wNext">${s===WSTEPS.length-1?"İşletmeyi kaydet":"Devam"}${s===WSTEPS.length-1?"":ic("chev-r")}</button></div>`;
  box.setAttribute("aria-labelledby","wizT");
  if(s===4&&W.acc!=="none"&&$("waEmail")){$("waEmail").value=W.accEmail;if($("waName"))$("waName").value=W.accName;const r=document.querySelector(`input[name=waMode][value=${W.accHow}]`);if(r)r.checked=true}
  $("wBack")&&($("wBack").onclick=()=>{collectStep();W.step--;drawWizard()});
  $("wNext").onclick=()=>{collectStep();if(!validateStep())return;if(W.step===WSTEPS.length-1)saveWizard();else{W.step++;drawWizard()}};
  box.querySelectorAll("input[name=wAcc]").forEach(r=>r.onchange=()=>{collectStep();W.acc=r.value;drawWizard()});
  $("wName")?.addEventListener("input",()=>{const d2=bizDuplicates({name:$("wName").value});$("wNameErr").innerHTML=d2.name.length?`Bu adla kayıtlı bir işletme var: <b>${esc(d2.name[0].name)}</b>. Aynı işletmeyi tekrar eklemeyin.`:""});
  box.querySelector(".modal-b a")?.addEventListener("click",()=>closeLayer(m));
  requestAnimationFrame(()=>box.querySelector(".modal-b input:not([disabled]),.modal-b select")?.focus());
}
function collectStep(){
  const s=W.step;
  if(s===0)W.name=$("wName").value.trim();
  if(s===1){const p=$("wPhone").value.trim(),e=$("wEmail").value.trim();if(p!==W.phone||e!==W.email)W.dupOk=false;W.phone=p;W.email=e;if($("wDupOk"))W.dupOk=$("wDupOk").checked}
  if(s===2)W.category=document.querySelector("input[name=wCat]:checked")?.value||"";
  if(s===3)W.sites=new Set([...document.querySelectorAll("[data-wsite]:checked")].map(x=>x.value));
  if(s===4){W.acc=document.querySelector("input[name=wAcc]:checked")?.value||"none";if($("waEmail"))W.accEmail=$("waEmail").value.trim();if($("waName"))W.accName=$("waName").value.trim();W.accHow=document.querySelector("input[name=waMode]:checked")?.value||W.accHow}
}
function validateStep(){
  const s=W.step,d=bizDuplicates({name:W.name,phone:W.phone,email:W.email});
  if(s===0){
    if(W.name.length<2){$("wNameErr").textContent="İşletme adı en az 2 karakter olmalı.";$("wName").setAttribute("aria-invalid","true");return false}
    if(d.name.length){$("wName").setAttribute("aria-invalid","true");return false}
  }
  if(s===1){
    let ok=true;
    if(!W.phone&&!W.email){$("wPhoneErr").textContent="En az bir iletişim bilgisi (telefon veya e-posta) girin.";ok=false}
    if(W.phone&&!validPhone(W.phone)){$("wPhoneErr").textContent="Geçerli bir telefon numarası girin (10–13 rakam).";ok=false}
    if(W.email&&!validEmail(W.email)){$("wEmailErr").textContent="Geçerli bir e-posta girin.";ok=false}
    if(ok&&(d.phone.length||d.email.length)&&!W.dupOk){drawWizard();toast("Aynı iletişim bilgisi başka işletmede kayıtlı. Devam etmek için onay kutusunu işaretleyin.","warn");return false}
    return ok;
  }
  if(s===2&&!W.category){$("wCatErr").textContent="Bir kategori seçin.";return false}
  if(s===4&&W.acc!=="none"){
    if(!validEmail(W.accEmail)){$("wAccErr").textContent="Hesap için geçerli bir e-posta girin.";return false}
  }
  return true;
}
async function saveWizard(){
  const btn=$("wNext");btn.disabled=true;btn.classList.add("loading");$("wBack")&&($("wBack").disabled=true);
  const res=[];let biz=null;
  try{
    /* 1) İşletme kaydı */
    const{data,error}=await db.from("businesses").insert({name:W.name,category:W.category,phone:W.phone||null,email:W.email||null,active:true}).select().single();
    if(error||!data){
      res.push(["error","İşletme kaydı oluşturulamadı",error?.message||"Kayıt dönmedi (RLS insert/select izni olmayabilir)."]);
      W.done={res,biz:null};return;
    }
    biz=data;res.push(["ok","İşletme kaydı oluşturuldu",`ID ${data.id}`]);
    /* 2) Site bağlantıları */
    if(W.sites.size){
      const rows=[...W.sites].map(id=>({site_id:Number(id),business_id:Number(biz.id),active:true}));
      const r=await db.from("site_businesses").upsert(rows,{onConflict:"site_id,business_id"}).select();
      if(r.error||!r.data||r.data.length<rows.length)res.push(["error","Site bağlantıları kaydedilemedi",(r.error?.message||"Beklenen satır sayısı dönmedi")+" — detay sayfasından tekrar bağlayabilirsiniz."]);
      else res.push(["ok",`${rows.length} siteye bağlandı`,[...W.sites].map(siteName).join(", ")]);
    }else res.push(["skip","Site bağlantısı yapılmadı","Detay sayfasından eklenebilir."]);
    /* 3) Giriş hesabı */
    if(W.acc!=="none"){
      const body=W.acc==="link"?{action:"link",email:W.accEmail}:W.accHow==="password"?{action:"create",email:W.accEmail,full_name:W.accName||null,password:genPassword()}:{action:"invite",email:W.accEmail,full_name:W.accName||null};
      try{await callAccountFn({...body,business_id:biz.id});res.push(["ok",W.acc==="link"?"Kullanıcı bağlandı":body.action==="invite"?"Davet e-postası gönderildi":"Giriş hesabı oluşturuldu",W.accEmail]);if(body.password)W.pw=[W.accEmail,body.password]}
      catch(e){res.push(["error","Giriş hesabı oluşturulamadı",e.message+" — işletme kaydı korunuyor; detay sayfasından tekrar deneyin."])}
    }else res.push(["skip","Giriş hesabı oluşturulmadı","Detay sayfasından eklenebilir."]);
    W.done={res,biz};
  }catch(e){
    res.push(["error","Beklenmeyen hata",e.message||""]);W.done={res,biz};
  }finally{
    await loadAll(false);
    drawWizard();
  }
}
function drawWizardResult(){
  const box=$("genModal").querySelector(".modal-box"),{res,biz}=W.done;
  const ok=res.every(r=>r[0]!=="error");
  box.innerHTML=`<div class="modal-h"><div class="t"><h2 id="wizT">${biz?(ok?"İşletme oluşturuldu":"İşletme oluşturuldu, bazı adımlar tamamlanamadı"):"İşletme oluşturulamadı"}</h2><p>${esc(W.name)}</p></div></div>
    <div class="modal-b"><div class="result-list">${res.map(([k,t,d])=>`<div class="alert ${k==="ok"?"alert-ok":k==="error"?"alert-error":"alert-info"}">${ic(k==="ok"?"check-c":k==="error"?"alert":"info")}<div><b>${esc(t)}</b>${d?`<br>${esc(d)}`:""}</div></div>`).join("")}</div>
    ${W.pw?`<div class="alert alert-warn" style="margin-top:12px">${ic("key")}<div><b>Geçici şifre (bir kez gösterilir):</b> <span class="mono">${esc(W.pw[1])}</span><br>${esc(W.pw[0])} · Güvenli bir kanalla iletin.</div></div>`:""}</div>
    <div class="modal-f">${biz?`<button class="btn btn-primary" type="button" id="wGo">İşletme sayfasına git${ic("chev-r")}</button>`:`<button class="btn btn-secondary" type="button" id="wRetry">Geri dön ve düzelt</button><button class="btn btn-primary" type="button" data-close>Kapat</button>`}</div>`;
  if(biz)$("wGo").onclick=()=>{closeLayer($("genModal"));go("businesses",[String(biz.id)])};
  else $("wRetry").onclick=()=>{W.done=null;W.step=WSTEPS.length-1;drawWizard()};
  if(biz)W.pw&&toast("Geçici şifreyi kaydetmeyi unutmayın","warn");
}

/* =========================================================
   Finans — yalnızca orders.price üzerinden SİPARİŞ TUTARLARI
   Veritabanında ödeme, tahsilat veya komisyon kaydı yok; bu sayfa tahsilat ya da
   BAKSANA geliri göstermez. Komisyon için KURULUM.md → Opsiyonel: finans altyapısı.
========================================================= */
const FF={from:"",to:"",field:"completed",biz:"",site:""};
function finDay(o){return FF.field==="completed"?localDay(o.completed_at):localDay(o.created_at)}
function finList(){
  return S.orders.filter(o=>{
    if(FF.biz==="none"?o.business_id!=null:FF.biz&&!same(o.business_id,FF.biz))return false;
    if(FF.site&&!same(o.site_id,FF.site))return false;
    if(FF.from||FF.to){
      if(FF.field==="completed"&&o.status!=="Tamamlandı")return false;
      const d=finDay(o);if(!d)return false;
      if(FF.from&&d<FF.from)return false;if(FF.to&&d>FF.to)return false;
    }
    return true;
  });
}
const sumP=l=>l.filter(hasPrice).reduce((a,o)=>a+Number(o.price),0);
PAGES.finance={
  title:"Finans",
  render(){
    const g=gate("orders");
    const opt=(v,l,c)=>`<option value="${esc(v)}" ${String(c)===String(v)?"selected":""}>${esc(l)}</option>`;
    const head=`<div class="page-head"><div><h1>Finans</h1><p>Sipariş tutarları · kaynak: <code>orders.price</code></p></div>
      <div class="actions"><button class="btn btn-secondary" type="button" data-f="csv">${ic("download")}CSV indir</button></div></div>
      <div class="alert alert-warn">${ic("info")}<div><b>Sipariş fiyatı ≠ tahsilat ≠ BAKSANA komisyonu.</b> Veritabanında ödeme, tahsilat veya komisyon kaydı bulunmuyor. Aşağıdaki tutarlar yalnızca siparişlerde kayıtlı fiyatlardır; işletmenin gerçekte tahsil ettiği tutarı veya BAKSANA gelirini göstermez. Komisyon oranı belirlenmedi.</div></div>`;
    if(g)return head+`<section class="card mt">${g}</section>`;
    const list=finList();
    const done=list.filter(o=>o.status==="Tamamlandı"),open=list.filter(o=>!CLOSED.includes(o.status)),lost=list.filter(o=>o.status==="İptal Edildi"||o.status==="Reddedildi");
    const noPrice=list.filter(o=>!hasPrice(o)).length;
    const byBiz={};list.forEach(o=>{const k=o.business_id==null?"none":String(o.business_id);(byBiz[k]=byBiz[k]||[]).push(o)});
    const bizRows=Object.entries(byBiz).map(([k,l])=>({k,name:k==="none"?"Atanmamış":bizName(k),n:l.length,done:l.filter(o=>o.status==="Tamamlandı"),open:l.filter(o=>!CLOSED.includes(o.status))})).sort((a,b)=>sumP(b.done)-sumP(a.done));
    const months={};done.forEach(o=>{const k=localDay(o.completed_at).slice(0,7)||"Tarihsiz";(months[k]=months[k]||[]).push(o)});
    const mk=Object.keys(months).sort().reverse();
    const monthName=k=>k==="Tarihsiz"?k:new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(+k.slice(0,4),+k.slice(5,7)-1,1));
    return head+`
    <section class="card mt"><div class="toolbar">
      <select class="select" id="fField" aria-label="Tarih alanı">${opt("completed","Tamamlanma tarihi",FF.field)}${opt("created","Oluşturulma tarihi",FF.field)}</select>
      <div class="daterange"><input class="input" id="fFrom" type="date" value="${esc(FF.from)}" aria-label="Başlangıç"><span>–</span><input class="input" id="fTo" type="date" value="${esc(FF.to)}" aria-label="Bitiş"></div>
      <select class="select" id="fBiz" aria-label="İşletme">${opt("","Tüm işletmeler",FF.biz)}${opt("none","Atanmamış",FF.biz)}${S.businesses.map(b=>opt(b.id,b.name,FF.biz)).join("")}</select>
      <select class="select" id="fSite" aria-label="Site">${opt("","Tüm siteler",FF.site)}${S.sites.map(s=>opt(s.id,s.name,FF.site)).join("")}</select>
      ${FF.from||FF.to||FF.biz||FF.site?`<button class="btn btn-ghost" type="button" data-f="clear">${ic("x")}Temizle</button>`:""}
    </div>${FF.field==="completed"&&(FF.from||FF.to)?`<div class="card-foot">Tamamlanma tarihine göre filtrelendiğinde yalnızca tamamlanan siparişler dahil edilir.</div>`:""}</section>
    <div class="kpis mt">
      <div class="kpi"><div class="kpi-top">${ic("check-c")}Tamamlanan işlerin tutarı</div><div class="kpi-val">${money(sumP(done))}</div><div class="kpi-sub">${done.length} sipariş${done.filter(o=>!hasPrice(o)).length?` · ${done.filter(o=>!hasPrice(o)).length} fiyatsız`:""}</div></div>
      <div class="kpi"><div class="kpi-top">${ic("activity")}Açık siparişlerin tutarı</div><div class="kpi-val">${money(sumP(open))}</div><div class="kpi-sub">${open.length} sipariş · henüz tamamlanmadı</div></div>
      <div class="kpi"><div class="kpi-top">${ic("ban")}İptal / red tutarı</div><div class="kpi-val">${money(sumP(lost))}</div><div class="kpi-sub">${lost.length} sipariş</div></div>
      <div class="kpi"><div class="kpi-top">${ic("alert")}Fiyatı olmayan</div><div class="kpi-val">${noPrice}</div><div class="kpi-sub">Toplamlara dahil edilmedi</div></div>
    </div>
    <section class="card mt"><div class="card-head"><div><h2>İşletme bazında</h2><p>Sipariş tutarları (tahsilat değildir)</p></div></div>
      ${bizRows.length?`<table class="tbl cards"><thead><tr><th>İşletme</th><th class="r">Sipariş</th><th class="r">Tamamlanan</th><th class="r">Tamamlanan tutar</th><th class="r">Açık tutar</th><th class="r hide-m">Ortalama (tamamlanan)</th></tr></thead><tbody>
        ${bizRows.map(r=>`<tr ${r.k!=="none"?`class="click" data-nav="businesses" data-params="${esc(r.k)}"`:""}><td class="m-title"><b>${esc(r.name)}</b></td><td class="r" data-l="Sipariş">${r.n}</td><td class="r" data-l="Tamamlanan">${r.done.length}</td><td class="r" data-l="Tamamlanan tutar">${money(sumP(r.done))}</td><td class="r" data-l="Açık tutar">${money(sumP(r.open))}</td><td class="r hide-m m-hide">${r.done.filter(hasPrice).length?money(sumP(r.done)/r.done.filter(hasPrice).length):"-"}</td></tr>`).join("")}
        </tbody><tfoot><tr><td>Toplam</td><td class="r">${list.length}</td><td class="r">${done.length}</td><td class="r">${money(sumP(done))}</td><td class="r">${money(sumP(open))}</td><td class="r hide-m m-hide"></td></tr></tfoot></table>`:emptyHTML("wallet","Bu filtrede sipariş yok","")}
    </section>
    <div class="grid-2 even">
      <section class="card"><div class="card-head"><div><h2>Aylık tamamlanan</h2><p>completed_at ayına göre</p></div></div>
        ${mk.length?`<table class="tbl"><thead><tr><th>Ay</th><th class="r">Sipariş</th><th class="r">Tutar</th></tr></thead><tbody>${mk.map(k=>`<tr><td>${esc(monthName(k))}</td><td class="r">${months[k].length}</td><td class="r">${money(sumP(months[k]))}</td></tr>`).join("")}</tbody></table>`:emptyHTML("calendar","Tamamlanan sipariş yok","")}
      </section>
      <section class="card"><div class="card-head"><div><h2>Komisyon ve tahsilat</h2><p>Altyapı durumu</p></div></div>
        <div class="card-body"><div class="checks">
          <div class="check disabled"><span>${ic("x-c")}</span><span><b>Komisyon oranı</b><small>Veritabanında komisyon alanı yok. Oran tahmin edilmez.</small></span></div>
          <div class="check disabled"><span>${ic("x-c")}</span><span><b>Ödeme / tahsilat kayıtları</b><small>Ödeme tablosu yok; tahsilat gerçekleşmiş gibi gösterilmez.</small></span></div>
        </div><p class="field-help" style="margin-top:10px">Kurmak isterseniz KURULUM.md → “Opsiyonel: finans altyapısı” bölümündeki tasarımı inceleyin.</p></div>
      </section>
    </div>`;
  },
  on(type,e){
    const t=e.target;
    if(type==="click"){const a=t.closest("[data-f]")?.dataset.f;
      if(a==="clear"){Object.assign(FF,{from:"",to:"",biz:"",site:""});render()}
      if(a==="csv"){const l=finList();downloadCSV(`baksana-finans-${TODAY()}.csv`,[["Sipariş kodu","Durum","İşletme","Site","Hizmet","Oluşturulma","Tamamlanma","Sipariş fiyatı"],...l.map(o=>[o.order_code||"#"+o.id,o.status,o.business_id==null?"":bizName(o.business_id),siteName(o.site_id),o.service,stamp(o.created_at),stamp(o.completed_at),hasPrice(o)?String(o.price).replace(".",","):""])]);toast(`${l.length} satır indirildi`)}
      return}
    const map={fField:"field",fFrom:"from",fTo:"to",fBiz:"biz",fSite:"site"};
    if(map[t.id]&&type==="change"){FF[map[t.id]]=t.value;if(FF.from&&FF.to&&FF.from>FF.to){toast("Başlangıç tarihi bitişten sonra olamaz.","error");FF[map[t.id]]=""}render()}
  }
};

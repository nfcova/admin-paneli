/* =========================================================
   Hizmetler — müşteri sitesindeki sabit katalog + işletme kategorileri
   Veritabanında hizmet tablosu YOK: hizmetler site-hizmet/index.html içinde tanımlı.
   Bu sayfa salt okunurdur; hizmet ekleme/düzenleme için KURULUM.md → Opsiyonel bölümüne bakın.
========================================================= */
PAGES.services={
  title:"Hizmetler",
  render(){
    const g=gate("orders","businesses");
    const head=`<div class="page-head"><div><h1>Hizmetler</h1><p>Müşteri sitesinde sunulan hizmetler ve bunları karşılayan işletme kategorileri</p></div></div>
      <div class="alert alert-info">${ic("info")}<div>Hizmet listesi şu anda <b>veritabanında değil</b>, müşteri sitesinin kodunda (<code>site-hizmet/index.html → serviceOptions</code>) tanımlı. Bu yüzden bu sayfa salt okunurdur: buradan hizmet eklemek müşteri sitesine yansımazdı. İşletmenin hangi hizmeti verdiği <code>businesses.category</code> alanıyla belirlenir ve işletme düzenleme ekranından değiştirilebilir.</div></div>`;
    if(g)return head+`<section class="card mt">${g}</section>`;
    const activeSites=S.sites.filter(s=>s.active);
    const rows=Object.entries(SERVICE_CATALOG).map(([sv,opts])=>{
      const os=S.orders.filter(o=>o.service===sv);
      const biz=S.businesses.filter(b=>categoryFits(b,sv));
      const covered=activeSites.filter(s=>linksOfSite(s.id).some(l=>l.active&&biz.some(b=>b.active&&same(b.id,l.business_id)))).length;
      return {sv,opts,orders:os.length,done:os.filter(o=>o.status==="Tamamlandı").length,biz,covered};
    });
    const unknown=[...new Set(S.orders.map(o=>o.service).filter(s=>s&&!SERVICE_CATALOG[s]))];
    const cats=categories().map(c=>({c,all:S.businesses.filter(b=>b.category===c),act:S.businesses.filter(b=>b.category===c&&b.active)}));
    return head+`
    <section class="card mt"><div class="card-head"><div><h2>Hizmet kataloğu</h2><p>Müşteri sitesinde görünen ${Object.keys(SERVICE_CATALOG).length} hizmet</p></div></div>
      <table class="tbl cards"><thead><tr><th>Hizmet</th><th class="hide-m">Seçenekler</th><th>Uygun kategori / işletme</th><th class="r">Kapsanan aktif site</th><th class="r">Sipariş</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="m-title"><b>${esc(r.sv)}</b></td><td class="hide-m m-hide"><div class="tags">${r.opts.map(o=>`<span class="tag">${esc(o)}</span>`).join("")}</div></td>
        <td data-l="İşletme">${r.biz.length?`${[...new Set(r.biz.map(b=>b.category))].map(esc).join(", ")} <small>${r.biz.filter(b=>b.active).length} aktif işletme</small>`:'<span class="tag amber">Uygun işletme yok</span>'}</td>
        <td class="r" data-l="Kapsanan site">${r.covered} / ${activeSites.length}</td><td class="r" data-l="Sipariş">${r.orders} <small>${r.done} tamamlandı</small></td></tr>`).join("")}
      </tbody></table>
      <div class="card-foot">“Uygun” eşleşme kategori adının hizmet adıyla benzerliğine göre tahmin edilir. Siparişin gerçek yönlendirme kuralı <code>create_public_order</code> fonksiyonundadır (sql/00 ile görüntüleyebilirsiniz).</div>
    </section>
    ${unknown.length?`<div class="alert alert-warn mt">${ic("alert")}<div>Siparişlerde katalogda olmayan hizmet adları var: ${unknown.map(esc).join(", ")}. Müşteri sitesinde eski bir hizmet adı kalmış olabilir.</div></div>`:""}
    <section class="card mt"><div class="card-head"><div><h2>İşletme kategorileri</h2><p>businesses.category</p></div></div>
      <table class="tbl"><thead><tr><th>Kategori</th><th class="r">Aktif</th><th class="r">Toplam</th></tr></thead><tbody>${cats.map(x=>`<tr class="click" data-cat="${esc(x.c)}"><td>${esc(x.c)}</td><td class="r">${x.act.length}</td><td class="r">${x.all.length}</td></tr>`).join("")}</tbody></table>
    </section>`;
  },
  on(type,e){
    const r=type==="click"&&e.target.closest("[data-cat]");
    if(r){Object.assign(BF,{q:"",status:"",category:r.dataset.cat,site:"",page:1});go("businesses")}
  }
};

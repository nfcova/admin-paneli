/* =========================================================
   Ayarlar ve altyapı — admin hesabı, panel tercihleri, kurulum durumu
========================================================= */
const REPO_DOC="https://github.com/nfcova/admin-paneli/blob/main/KURULUM.md";
PAGES.settings={
  title:"Ayarlar ve altyapı",
  onInfra:true,
  render(){
    const i=S.infra,u=S.session?.user;
    const row=(state,title,okText,missText,step)=>`<div class="setting"><div style="display:flex;gap:12px;align-items:flex-start"><div class="li-ic ${state===true?"green":state===false?"amber":""}">${ic(state===true?"check-c":state===false?"alert":"clock")}</div><div><b>${title}</b><small>${state===true?okText:state===false?missText:"Kontrol ediliyor…"}</small></div></div>${state===false?`<span class="tag amber">${step}</span>`:state===true?`<span class="tag green">Kurulu</span>`:""}</div>`;
    const collapsed=document.body.classList.contains("side-collapsed");
    return `
    <div class="page-head"><div><h1>Ayarlar ve altyapı</h1><p>Yönetici hesabı ve sunucu tarafı kurulum durumu</p></div></div>
    <div class="grid-2">
      <div class="stack">
        <section class="card"><div class="card-head"><div><h2>Altyapı durumu</h2><p>${i.checkedAt?"Son kontrol "+esc(stamp(i.checkedAt)):"Kontrol ediliyor"} · yalnızca okuma yapılır</p></div><button class="btn btn-secondary btn-sm" type="button" data-st="probe">${ic("refresh")}Yeniden kontrol et</button></div>
          ${row(i.isAdminFn,"Sunucu tarafı admin doğrulaması","<code>is_admin()</code> mevcut ve bu hesap için true döndürüyor.","<code>is_admin()</code> bulunamadı. Admin yetkisi şu an yalnızca profiles.role ile kontrol ediliyor; RLS politikaları buna dayanmalı.","sql/01")}
          ${row(i.audit,"İşlem günlüğü","Değişiklikler admin_audit_log tablosuna kaydediliyor.","admin_audit_log yok; değişiklik geçmişi tutulmuyor.","sql/03")}
          ${row(i.accountFn,"İşletme hesap servisi (Edge Function)",`<code>${ACCOUNT_FN}</code> yanıt veriyor; hesap oluşturma/bağlama etkin.`,`<code>${ACCOUNT_FN}</code> erişilemiyor; hesap oluşturma ve bağlama kapalı.`,"Adım 4")}
          <div class="card-foot">Kurulum adımları: <a href="${REPO_DOC}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:600">KURULUM.md</a>. RLS politikalarının doğruluğu tarayıcıdan güvenilir biçimde ölçülemez; <code>sql/00_mevcut_durum_kontrol.sql</code> çıktısıyla doğrulayın.</div>
        </section>
        <section class="card"><div class="card-head"><div><h2>Veri kaynakları</h2><p>Bu panelin okuduğu tablolar</p></div></div>
          <table class="tbl"><thead><tr><th>Tablo</th><th class="r">Kayıt</th><th>Durum</th></tr></thead><tbody>
          ${[["orders","Siparişler",S.orders],["businesses","İşletmeler",S.businesses],["sites","Siteler",S.sites],["site_businesses","Site–işletme",S.links]].map(([k,l,arr])=>{const err=S.loadErrors[k==="site_businesses"?"links":k];return `<tr><td><b>${l}</b><small class="mono">${k}</small></td><td class="r">${S.loaded&&!err?arr.length:"-"}</td><td>${err?`<span class="tag red">${esc(err)}</span>`:S.loaded?'<span class="tag green">Okunuyor</span>':"…"}</td></tr>`}).join("")}
          </tbody></table></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Yönetici hesabı</h2></div>
          <dl class="dl"><dt>E-posta</dt><dd>${esc(u?.email||"-")}</dd><dt>Ad</dt><dd>${esc(S.admin?.full_name||"-")}</dd><dt>Rol</dt><dd><span class="tag violet">${esc(S.admin?.role||"-")}</span></dd><dt>Kullanıcı ID</dt><dd class="mono">${esc(u?.id||"-")}</dd><dt>Son giriş</dt><dd>${esc(stamp(u?.last_sign_in_at)||"-")}</dd><dt>Oturum bitişi</dt><dd>${S.session?.expires_at?esc(stamp(S.session.expires_at*1000)):"-"} <small class="muted">(otomatik yenilenir)</small></dd></dl></section>
        <section class="card"><div class="card-head"><h2>Panel</h2></div>
          <div class="setting"><div><b>Daraltılmış kenar menüsü</b><small>Masaüstünde yalnızca simgeler</small></div><button class="switch" type="button" role="switch" aria-checked="${collapsed}" aria-label="Daraltılmış kenar menüsü" data-st="side"></button></div>
          <div class="setting"><div><b>Canlı güncelleme</b><small>Değişiklikler anlık alınır, ayrıca 30 sn'de bir kontrol edilir</small></div>${syncHTML()}</div>
          <div class="setting"><div><b>Platform ayarları</b><small>Veritabanında platform ayarları tablosu bulunmuyor; yönetilecek ek ayar yok.</small></div></div>
        </section>
        <section class="card"><div class="setting"><div><b>Oturumu kapat</b><small>Bu cihazdaki yönetici oturumu sonlandırılır</small></div><button class="btn btn-danger-soft" type="button" data-action="logout">${ic("logout")}Çıkış yap</button></div></section>
      </div>
    </div>`;
  },
  on(type,e){
    if(type!=="click")return;
    const a=e.target.closest("[data-st]")?.dataset.st;
    if(a==="probe"){S.infra={isAdminFn:null,audit:null,accountFn:null,checkedAt:null};render();probeInfra().then(()=>{render();toast("Altyapı durumu güncellendi")})}
    if(a==="side")toggleSide();
  }
};

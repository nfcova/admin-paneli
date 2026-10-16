/* =========================================================
   Genel Bakış — tüm sayılar orders / businesses / sites / site_businesses tablolarından
========================================================= */
const PENDING_SLA_HOURS=3;      /* bu süreden uzun bekleyen siparişler uyarı olarak listelenir */
const PROPOSAL_SLA_HOURS=24;

/* Dikkat gerektirenler: yalnızca mevcut verilerden türetilir */
function attention(){
  if(!S.loaded)return [];
  const out=[],now=Date.now();
  const open=S.orders.filter(o=>!CLOSED.includes(o.status));
  open.filter(o=>o.business_id==null).forEach(o=>out.push({o,tone:"red",icon:"alert",t:"İşletme atanmamış sipariş",s:`${o.service||"Hizmet"} · ${siteName(o.site_id)}`}));
  open.filter(o=>o.business_id!=null&&bizById(o.business_id)&&!bizById(o.business_id).active).forEach(o=>out.push({o,tone:"red",icon:"ban",t:"Pasif işletmeye ait açık sipariş",s:`${bizName(o.business_id)} · ${o.order_code||"#"+o.id}`}));
  S.orders.filter(o=>o.status==="Beklemede"&&o.business_id!=null&&propState(o)!=="pending"&&o.created_at&&now-new Date(o.created_at)>PENDING_SLA_HOURS*3600e3)
    .forEach(o=>out.push({o,tone:"amber",icon:"clock",t:`${PENDING_SLA_HOURS} saatten uzun süredir onay bekliyor`,s:`${bizName(o.business_id)} · ${ago(o.created_at)}`}));
  S.orders.filter(o=>o.status==="Beklemede"&&propState(o)==="pending"&&o.time_proposed_at&&now-new Date(o.time_proposed_at)>PROPOSAL_SLA_HOURS*3600e3)
    .forEach(o=>out.push({o,tone:"amber",icon:"clock",t:"Saat önerisi 24 saattir yanıtsız",s:`${o.customer_name||"Müşteri"} · ${bizName(o.business_id)}`}));
  S.sites.filter(s=>s.active&&!linksOfSite(s.id).some(l=>l.active&&bizById(l.business_id)?.active)).forEach(s=>out.push({site:s,tone:"blue",icon:"building",t:"Aktif işletmesi olmayan site",s:s.name}));
  S.businesses.filter(b=>b.active&&!linksOfBiz(b.id).some(l=>l.active)).forEach(b=>out.push({biz:b,tone:"violet",icon:"store",t:"Hiçbir siteye bağlı olmayan işletme",s:b.name}));
  return out;
}
function attentionHTML(x){
  const attr=x.o?`data-open-order="${esc(x.o.id)}"`:x.site?`data-nav="sites" data-params="${esc(x.site.id)}"`:`data-nav="businesses" data-params="${esc(x.biz.id)}"`;
  return `<button class="li" type="button" ${attr}><div class="li-ic ${x.tone}">${ic(x.icon)}</div><div class="li-t"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>${x.o?`<div class="li-r">${esc(x.o.order_code||"#"+x.o.id)}</div>`:ic("chev-r")}</button>`;
}

/* Günlük sipariş grafiği (tek seri → marka rengi; her çubukta ipucu, tablo görünümü ayrıca var) */
function dailyChart(days=30){
  const t=TODAY(),keys=Array.from({length:days},(_,i)=>addDays(t,i-days+1));
  const counts=Object.fromEntries(keys.map(k=>[k,0]));
  S.orders.forEach(o=>{const k=localDay(o.created_at);if(k in counts)counts[k]++});
  const vals=keys.map(k=>counts[k]),max=Math.max(1,...vals),total=vals.reduce((a,b)=>a+b,0);
  const W=720,H=200,pl=28,pb=22,pt=8,cw=(W-pl)/days,bw=Math.max(4,cw-6);
  const step=max<=4?1:Math.ceil(max/4),ticks=[];for(let v=0;v<=max;v+=step)ticks.push(v);
  const y=v=>pt+(H-pt-pb)*(1-v/(ticks[ticks.length-1]||1));
  const top=ticks[ticks.length-1];
  const yy=v=>pt+(H-pt-pb)*(1-v/top);
  const bars=keys.map((k,i)=>{
    const v=vals[i],x=pl+i*cw+(cw-bw)/2,h=Math.max(v?3:1.5,(H-pt-pb)*v/top);
    const lbl=`${dateTR(k)}: ${v} sipariş`;
    return `<g class="col" tabindex="0" role="img" aria-label="${esc(lbl)}" data-tip="${esc(lbl)}" data-x="${x+bw/2}" data-y="${H-pb-h}"><rect class="hit" x="${pl+i*cw}" y="${pt}" width="${cw}" height="${H-pt-pb}"></rect><rect class="b ${v?"":"zero"}" x="${x}" y="${H-pb-h}" width="${bw}" height="${h}" rx="${Math.min(4,bw/2)}"></rect></g>`;
  }).join("");
  const grid=ticks.map(v=>`<line x1="${pl}" x2="${W}" y1="${yy(v)}" y2="${yy(v)}"></line>`).join("");
  const yl=ticks.map(v=>`<text x="${pl-6}" y="${yy(v)+4}" text-anchor="end">${v}</text>`).join("");
  const xl=keys.map((k,i)=>i%7===(days-1)%7?`<text x="${pl+i*cw+cw/2}" y="${H-6}" text-anchor="middle">${k.slice(8)}.${k.slice(5,7)}</text>`:"").join("");
  return {total,html:`<div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="group" aria-label="Son ${days} günde oluşturulan siparişler"><g class="grid">${grid}</g><g class="axis">${yl}${xl}</g>${bars}</svg><div class="tip" hidden></div></div>`};
}
function chartTip(e){
  const g=e.target.closest?.("g.col");const ch=e.target.closest?.("[data-chart]");
  document.querySelectorAll("[data-chart] .tip").forEach(t=>{if(!ch||!ch.contains(t))t.hidden=true});
  if(!g||!ch)return;
  const svg=ch.querySelector("svg"),tip=ch.querySelector(".tip"),r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal;
  tip.textContent=g.dataset.tip;tip.hidden=false;
  /* SVG öğelerinde offsetLeft yok: konum, grafik kutusuna göre hesaplanır; ipucu kenarlardan taşmaz */
  const cr=ch.getBoundingClientRect();
  const x=r.left-cr.left+Number(g.dataset.x)*r.width/vb.width,half=tip.offsetWidth/2+4;
  tip.style.left=Math.min(Math.max(x,half),cr.width-half)+"px";
  tip.style.top=(r.top-cr.top+Number(g.dataset.y)*r.height/vb.height)+"px";
}
["mouseover","focusin"].forEach(t=>document.addEventListener(t,chartTip));
document.addEventListener("mouseleave",chartTip,true);

function serviceBreakdownHTML(list){
  const m={};list.forEach(o=>{const k=o.service||"Belirtilmemiş";m[k]=(m[k]||0)+1});
  const rows=Object.entries(m).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...rows.map(r=>r[1]));
  if(!rows.length)return emptyHTML("grid","Henüz sipariş yok","");
  return `<table class="tbl"><thead><tr><th>Hizmet</th><th style="width:45%"><span class="sr">Oran</span></th><th class="r">Sipariş</th></tr></thead><tbody>${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td><div class="bar-cell"><div class="bar"><i style="width:${v/max*100}%"></i></div></div></td><td class="r">${v} <span class="muted">· %${Math.round(v/list.length*100)}</span></td></tr>`).join("")}</tbody></table>`;
}

PAGES.overview={
  title:"Genel Bakış",
  render(){
    const L=!S.loaded,o=S.orders,cnt=f=>o.filter(f).length,t=TODAY();
    const v=x=>L?`<span class="sk" style="width:48px;height:22px;margin-top:2px"></span>`:x;
    const kpi=(icon,label,val,sub,attr="")=>`<${attr?"button":"div"} class="kpi" ${attr?`type="button" ${attr}`:""}><div class="kpi-top">${ic(icon)}${label}</div><div class="kpi-val">${v(val)}</div><div class="kpi-sub">${L?"&nbsp;":sub}</div></${attr?"button":"div"}>`;
    const pend=cnt(x=>x.status==="Beklemede"),act=cnt(x=>x.status==="Kabul Edildi"||x.status==="Devam Ediyor");
    const done=cnt(x=>x.status==="Tamamlandı"),canc=cnt(x=>x.status==="İptal Edildi"),rej=cnt(x=>x.status==="Reddedildi");
    const todayN=cnt(x=>localDay(x.created_at)===t),unassigned=cnt(x=>x.business_id==null&&!CLOSED.includes(x.status));
    const bA=S.businesses.filter(b=>b.active).length,sA=S.sites.filter(s=>s.active).length;
    const g=gate("orders");
    const ch=L||g?null:dailyChart(30);
    const att=attention();
    return `
    <div class="page-head"><div><h1>Genel Bakış</h1><p>${esc(new Intl.DateTimeFormat("tr-TR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date()))} · ${syncHTML()}</p></div>
      <div class="actions"><button class="btn btn-secondary" type="button" data-nav="sites" data-params="new">${ic("plus")}Site ekle</button><button class="btn btn-primary" type="button" data-nav="businesses" data-params="new">${ic("plus")}İşletme ekle</button></div></div>
    <div class="kpis">
      ${kpi("orders","Toplam sipariş",o.length,`Bugün oluşturulan <b>${todayN}</b>`,`data-nav="orders"`)}
      ${kpi("inbox","Bekleyen",pend,unassigned?`<b>${unassigned}</b> atanmamış`:"İşletme onayı bekliyor",`data-nav="orders" data-params="pending"`)}
      ${kpi("activity","Devam eden",act,"Kabul edildi + devam ediyor",`data-nav="orders" data-params="active"`)}
      ${kpi("check-c","Tamamlanan",done,`İptal <b>${canc}</b> · Red <b>${rej}</b>`,`data-nav="orders" data-params="completed"`)}
    </div>
    <div class="kpis mt">
      ${kpi("calendar","Bugün oluşturulan",todayN,"Yerel saate göre (created_at)")}
      ${kpi("store","İşletmeler",S.businesses.length,`<b>${bA}</b> aktif · <b>${S.businesses.length-bA}</b> pasif`,`data-nav="businesses"`)}
      ${kpi("building","Siteler",S.sites.length,`<b>${sA}</b> aktif · <b>${S.sites.length-sA}</b> pasif`,`data-nav="sites"`)}
      ${kpi("alert","Dikkat gerektiren",att.length,att.length?"Aşağıdaki listeye bakın":"Her şey yolunda")}
    </div>
    <div class="grid-2">
      <section class="card"><div class="card-head"><div><h2>Günlük siparişler</h2><p>Son 30 gün · oluşturulma tarihine göre${ch?` · toplam ${ch.total}`:""}</p></div></div>
        ${g||(L?skeletonRows(3):ch.html)}</section>
      <section class="card"><div class="card-head"><div><h2>Dikkat gerektirenler</h2><p>Atanmamış, geciken ve eksik eşleştirmeler</p></div>${att.length?`<span class="badge amber">${att.length}</span>`:""}</div>
        ${L?skeletonRows(3):att.length?att.slice(0,7).map(attentionHTML).join("")+(att.length>7?`<div class="card-foot">+${att.length-7} konu daha · üst çubuktaki zil simgesinden tümünü görün</div>`:""):`<div class="ok-line">${ic("check-c")}Dikkat gerektiren konu yok.</div>`}</section>
    </div>
    <div class="grid-2 even">
      <section class="card"><div class="card-head"><div><h2>Hizmet dağılımı</h2><p>Tüm siparişler · orders.service</p></div></div>${g||(L?skeletonRows(3):serviceBreakdownHTML(o))}</section>
      <section class="card"><div class="card-head"><div><h2>Son siparişler</h2></div><button class="btn btn-ghost btn-sm" type="button" data-nav="orders">Tümü${ic("chev-r")}</button></div>
        ${g||(L?skeletonRows(3):o.length?o.slice(0,7).map(x=>`<button class="li" type="button" data-open-order="${esc(x.id)}"><div class="li-t"><b>${esc(x.service||"Hizmet")} · <span class="mono">${esc(x.order_code||"#"+x.id)}</span></b><small>${esc(siteName(x.site_id))} · ${esc(bizName(x.business_id))} · ${esc(ago(x.created_at))}</small></div>${badge(x.status)}</button>`).join(""):emptyHTML("inbox","Henüz sipariş yok",""))}</section>
    </div>`;
  }
};

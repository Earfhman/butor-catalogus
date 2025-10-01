// ===== TSV catalog viewer (with hover image cycling) =====

// --- Helpers
function $(s, c=document){ return c.querySelector(s); }
function uniq(a){ return [...new Set(a)]; }
function toNumber(v){ const n = Number(String(v).replace(/\s/g,'')); return isNaN(n)?0:n; }

// URL-encode each path segment (handles spaces/é/ő/ű etc.)
function encodePathSegments(p){
  if(!p) return p;
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

// Build a list of candidate URLs for an image path from TSV.
// Tries several bases in case the site is served from a parent folder or images live under /images.
function candidatesFor(p){
  const clean = (p||"").replace(/^\.?\//,'');
  const seg = encodePathSegments(clean);
  return [
    './' + seg,                         // served at site root (site_out_new/)
    './' + clean,                       // unencoded fallback
    './site_out_new/' + seg,            // if you served parent folder instead of site root
    './images/' + seg,                  // if images are under images/...
    '/' + seg                           // absolute-from-root (sometimes Live Server mounts here)
  ];
}

// Try multiple srcs until one loads
function loadImgWithFallback(img, srcList){
  let i = 0;
  const tryNext = () => {
    if(i >= srcList.length){ img.style.display = 'none'; return; }
    img.src = srcList[i++];
  };
  img.onerror = tryNext;
  tryNext();
}

// Preload a list of URLs (no-op on errors)
function preload(urls){
  urls.forEach(u=>{
    const im = new Image();
    const chain = candidatesFor(u);
    let i = 0;
    const tryNext = () => {
      if(i >= chain.length) return;
      im.src = chain[i++];
      im.onerror = tryNext;
    };
    tryNext();
  });
}

// --- TSV loader
async function loadTSV(url){
  const txt = await fetch(url).then(r=>r.text());
  const lines = txt.trim().split(/\r?\n/);
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line=>{
    const cols = line.split('\t');
    const row = {};
    headers.forEach((h,i)=> row[h] = cols[i] ?? '');
    return row;
  });
}

// --- Transform a TSV row into a renderable item
function toItem(row){
  const imgs = ['img1','img2','img3','img4']
    .map(k => (row[k]||'').trim())
    .filter(Boolean);

  const priceDisplay = row.price_display?.trim()
    || (row.ar_indulo_huf && row.ar_gyors_huf
        ? `Induló: ${Number(row.ar_indulo_huf).toLocaleString('hu-HU')} Ft / Gyors: ${Number(row.ar_gyors_huf).toLocaleString('hu-HU')} Ft`
        : '');

  return {
    id: (row.id||'').trim(),
    cat: (row.cat||'').trim(),
    title: (row.title||'').trim(),
    desc: (row.desc || row.desc_hu || '').trim(),
    price_display: priceDisplay,
    price_numeric: toNumber(row.price_numeric || row.ar_indulo_huf || 0),
    images: imgs
  };
}

// --- Card rendering (with hover cycle)
function makeCard(it){
  const card = document.createElement('article');
  card.className = 'card';

  const cover = document.createElement('img');
  cover.className = 'cover';
  cover.alt = it.title || '';
  cover.loading = 'lazy';
  cover.decoding = 'async';

  // Preload all images for smooth hover swap
  if(it.images.length) preload(it.images);

  // Set initial cover
  if(it.images[0]){
    loadImgWithFallback(cover, candidatesFor(it.images[0]));
  } else {
    cover.style.display = 'none';
  }
  card.appendChild(cover);

  // Hover cycle logic
  // ------------------------------------------------
  const HOVER_INTERVAL_MS = 3000; // <-- change speed here
  let hoverTimer = null;
  let hoverIdx = 0;

  const startHover = () => {
    if (!it.images.length) return;
    // start from the next image (if only 1 image, nothing happens)
    hoverIdx = 1 % it.images.length;
    if (hoverTimer) clearInterval(hoverTimer);
    hoverTimer = setInterval(() => {
      // swap to next image (with fallback chain)
      const chain = candidatesFor(it.images[hoverIdx]);
      // quick fade-out/fade-in
      cover.classList.add('fade');
      cover.addEventListener('transitionend', function once(){
        cover.removeEventListener('transitionend', once);
        loadImgWithFallback(cover, chain);
        requestAnimationFrame(()=>cover.classList.remove('fade'));
      });
      hoverIdx = (hoverIdx + 1) % it.images.length;
    }, HOVER_INTERVAL_MS);
  };

  const stopHover = () => {
    if (hoverTimer) clearInterval(hoverTimer);
    hoverTimer = null;
    hoverIdx = 0;
    if (it.images[0]) {
      const chain = candidatesFor(it.images[0]);
      cover.classList.add('fade');
      cover.addEventListener('transitionend', function once(){
        cover.removeEventListener('transitionend', once);
        loadImgWithFallback(cover, chain);
        requestAnimationFrame(()=>cover.classList.remove('fade'));
      });
    }
  };

  card.addEventListener('mouseenter', startHover);
  card.addEventListener('mouseleave', stopHover);
  // ------------------------------------------------

  const content = document.createElement('div');
  content.className = 'content';

  const h = document.createElement('h3'); h.textContent = it.title || '';
  const d = document.createElement('p');  d.textContent = it.desc || '';

  const badges = document.createElement('div'); badges.className = 'badges';
  if(it.price_display){
    const b = document.createElement('span'); b.className = 'badge'; b.textContent = it.price_display; badges.appendChild(b);
  }
  if(it.cat){
    const c = document.createElement('span'); c.className = 'badge cat'; c.textContent = it.cat; badges.appendChild(c);
  }

  const thumbs = document.createElement('div'); thumbs.className = 'thumbgrid';
  it.images.slice(0,4).forEach((p, idx) => {
    const t = document.createElement('img');
    t.alt = (it.title||'') + ' ' + (idx+1);
    t.loading = 'lazy';
    t.decoding = 'async';
    loadImgWithFallback(t, candidatesFor(p));
    t.addEventListener('click', () => openLightbox(it.images, idx, it.title));
    thumbs.appendChild(t);
  });

  content.append(h, d, badges, thumbs);
  card.appendChild(content);
  return card;
}

// --- Lightbox
let LB = { idx:0, images:[], title:'' };
function openLightbox(images, startIdx=0, title=''){
  LB.images = images; LB.idx = startIdx; LB.title = title;
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lb-img');
  const cap = document.getElementById('lb-caption');

  function show(i){
    LB.idx = (i + LB.images.length) % LB.images.length;
    const srcs = candidatesFor(LB.images[LB.idx]);
    img.onerror = null;
    loadImgWithFallback(img, srcs);
    cap.textContent = `${title || ''} (${LB.idx+1}/${LB.images.length})`;
  }
  show(startIdx);
  box.classList.add('open');
  box.setAttribute('aria-hidden','false');
}
function closeLightbox(){
  const box = document.getElementById('lightbox');
  box.classList.remove('open');
  box.setAttribute('aria-hidden','true');
}
window.addEventListener('keydown', (e)=>{
  const box = document.getElementById('lightbox');
  if(!box.classList.contains('open')) return;
  if(e.key==='Escape') closeLightbox();
  if(e.key==='ArrowLeft') openLightbox(LB.images, LB.idx-1, LB.title);
  if(e.key==='ArrowRight') openLightbox(LB.images, LB.idx+1, LB.title);
});
document.querySelector('#lightbox .lb-close').addEventListener('click', closeLightbox);
document.querySelector('#lightbox .lb-prev').addEventListener('click', ()=>openLightbox(LB.images, LB.idx-1, LB.title));
document.querySelector('#lightbox .lb-next').addEventListener('click', ()=>openLightbox(LB.images, LB.idx+1, LB.title));

// --- App
(async function(){
  const rows = await loadTSV('assets/items.tsv');
  const items = rows.map(toItem);

  const q = document.getElementById('q');
  const cat = document.getElementById('cat');
  const sortSel = document.getElementById('sort');
  const grid = document.getElementById('grid');

  uniq(items.map(x=>x.cat).filter(Boolean))
    .sort((a,b)=>a.localeCompare(b,'hu'))
    .forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; cat.appendChild(o); });

  function applySort(list){
    const v = sortSel.value;
    if (v==='title-asc') list.sort((a,b)=>a.title.localeCompare(b.title,'hu'));
    if (v==='title-desc') list.sort((a,b)=>b.title.localeCompare(a.title,'hu'));
    if (v==='price-asc') list.sort((a,b)=>a.price_numeric-b.price_numeric);
    if (v==='price-desc') list.sort((a,b)=>b.price_numeric-a.price_numeric);
    return list;
  }

  function render(){
    const term = (q.value||'').toLowerCase();
    const c = cat.value;
    grid.innerHTML = '';
    const view = items
      .filter(x=>!c || x.cat===c)
      .filter(x=>!term || (x.title.toLowerCase().includes(term) || x.desc.toLowerCase().includes(term) || (x.cat||'').toLowerCase().includes(term)));
    applySort(view).forEach(it=>grid.appendChild(makeCard(it)));
  }

  q.addEventListener('input', render);
  cat.addEventListener('change', render);
  sortSel.addEventListener('change', render);
  render();
})();

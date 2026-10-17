// ---- Configuración ----
const TOTAL = 30;                                  // números del 1 al 30
const TIRADAS = 5;                                 // círculos por número
const PREMIOS = [130,110,100,50,50,20,20,10,10];   // en orden de llegada
const MONEDA = "S/";                               // TODO: cambiar si usas otra moneda
const VALE = 20;                                   // precio del cartón completo
const NUMS_POR_CARTON = 5;                          // números por cartón
const AUTO_MS = 900;
const KEY = "bingo-rifa-v2";
const CLAVE = "CAMBIAR-CLAVE";                     // TODO: clave secreta para firmar códigos (mejor en servidor)
const PAGO = {                                     // TODO: poner tus datos reales de cobro
  yape:          {label:"Yape",          datos:"TODO: número de Yape · titular"},
  plin:          {label:"Plin",          datos:"TODO: número de Plin · titular"},
  transferencia: {label:"Transferencia", datos:"TODO: banco · cuenta · CCI · titular"}
};
const ESTADOS = {pendiente:"Pago pendiente", comprobante:"Por confirmar", confirmado:"Pagado ✔", rechazado:"Rechazado"};

// ---- Estado ----
let counts = Array(TOTAL+1).fill(0);
let winners = [], history = [], cartones = [], seq = 0, timer = null, proofFor = null;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

// ---- Códigos y validación ----
function fnv(s){ let h = 0x811c9dc5; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).toUpperCase().padStart(8,"0"); }
const sign = (serie, nums, salt) => fnv(`${serie}|${nums.join(",")}|${salt}|${CLAVE}`).slice(0,6);
const newSalt = () => Math.floor(Math.random()*65536).toString(16).toUpperCase().padStart(4,"0");
const makeCode = c => `${c.serie}-${c.salt}${sign(c.serie, c.nums, c.salt)}`;
const ownerOf = n => cartones.find(c => c.estado !== "rechazado" && c.nums.includes(n));
const montoDe = () => VALE;
const ganados = c => c.estado === "confirmado" ? c.nums.filter(n => winners.includes(n)) : [];

function parseNums(txt){ return [...new Set(txt.split(/[^0-9]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b); }
// TODO: repetir esta validación en el servidor cuando exista backend
function validarNums(nums, ignoreId){
  if(nums.length !== NUMS_POR_CARTON) return `Elige exactamente ${NUMS_POR_CARTON} números.`;
  if(nums.some(n => !Number.isInteger(n) || n < 1 || n > TOTAL)) return `Solo números del 1 al ${TOTAL}.`;
  const tomados = nums.filter(n => { const o = ownerOf(n); return o && o.id !== ignoreId; });
  if(tomados.length) return `Ya vendido: ${tomados.join(", ")}.`;
  return "";
}

// ---- Persistencia ----
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify({counts,winners,history,cartones,seq,host:$("host").value,phone:$("phone").value})); }
  catch(e){ $("cMsg").className = "msg lose"; $("cMsg").textContent = "⚠ No se pudo guardar (almacenamiento lleno)."; }
}
function load(){
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if(s && s.counts && s.counts.length === TOTAL+1){
      counts = s.counts; winners = s.winners||[]; history = s.history||[]; cartones = s.cartones||[]; seq = s.seq||0;
      $("host").value = s.host||""; $("phone").value = s.phone||"";
    }
  }catch(e){}
}

// ---- Juego ----
const finished = () => winners.length >= PREMIOS.length;

function addHit(n){
  if(finished() || counts[n] >= TIRADAS) return false;
  counts[n]++; history.push(n);
  if(counts[n] === TIRADAS) winners.push(n);
  return true;
}
function drawRandom(){
  if(finished()){ stopAuto(); return; }
  const pool = [];
  for(let i=1;i<=TOTAL;i++) if(counts[i] < TIRADAS) pool.push(i);
  if(!pool.length){ stopAuto(); return; }
  const n = pool[Math.floor(Math.random()*pool.length)];
  addHit(n); announce(n); render(n); save();
  if(finished()) stopAuto();
}
function announce(n){
  const b = $("ball");
  b.textContent = n; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  const idx = winners.indexOf(n), o = ownerOf(n), msg = $("msg");
  b.style.setProperty("--bc", ballColor(n));
  if(idx >= 0){ confetti(); vibra([70,40,70]); } else vibra(15);
  if(idx >= 0){
    msg.textContent = `🏆 ¡El ${n} completó sus ${TIRADAS}! Gana ${MONEDA} ${PREMIOS[idx]}` + (o ? ` · ${o.name}` + (o.estado!=="confirmado" ? " (pago pendiente)" : "") : " · sin vender");
  } else msg.textContent = `Salió el ${n} (${counts[n]} de ${TIRADAS})`;
  if(finished()) msg.textContent += " · ¡Premios completos!";
}
function undo(){
  stopAuto();
  const n = history.pop(); if(!n) return;
  if(counts[n] === TIRADAS) winners = winners.filter(x => x !== n);
  counts[n]--;
  $("msg").textContent = `Se quitó una tirada del ${n}.`;
  render(history[history.length-1]); save();
}
function reset(){
  stopAuto();
  if(history.length && !confirm("¿Reiniciar la partida? Los cartones se conservan.")) return;
  counts = Array(TOTAL+1).fill(0); winners = []; history = [];
  $("ball").textContent = "–"; $("msg").textContent = "Toca “Tirar bola” para empezar.";
  render(); save();
}
function stopAuto(){ if(timer){ clearInterval(timer); timer = null; } $("auto").textContent = "▶ Auto"; }
function toggleAuto(){
  if(timer){ stopAuto(); return; }
  if(finished()) return;
  $("auto").textContent = "⏸ Pausa";
  drawRandom(); timer = setInterval(drawRandom, AUTO_MS);
}

// ---- Cartones ----
function addCarton(){
  const name = $("cName").value.trim(), nums = parseNums($("cNums").value), m = $("cMsg");
  m.className = "msg lose";
  if(!name){ m.textContent = "Escribe el nombre."; return; }
  const err = validarNums(nums); if(err){ m.textContent = err; return; }
  const serie = "BR-" + String(++seq).padStart(4,"0"), salt = newSalt();
  const c = {id:Date.now(), name, nums, metodo:$("cPay").value, estado:"pendiente", serie, salt, proof:null, entregado:false};
  c.code = makeCode(c);
  cartones.push(c);
  $("cName").value = ""; $("cNums").value = ""; updTotal();
  m.className = "msg win"; m.textContent = `Cartón ${serie} creado. Falta el pago ✔`;
  render(); save();
}
function updTotal(){
  $("cTotal").textContent = `Cartón de ${NUMS_POR_CARTON} números: ${MONEDA} ${VALE}`;
}
function shrink(file, cb){
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 720/Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width*s); c.height = Math.round(im.height*s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", .6));
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}
function setEstado(id, estado){
  const c = cartones.find(x => String(x.id) === String(id)); if(!c) return;
  if(estado === "confirmado"){
    const err = validarNums(c.nums, c.id);
    if(err){ alert("No se puede confirmar: " + err); return; }
    if(!c.proof){ alert("Falta la captura del abono."); return; }
  }
  c.estado = estado; render(); save();
}
function shareCarton(c){
  let text;
  if(c.estado === "confirmado"){
    const lines = c.nums.map(n => { const w = winners.indexOf(n); return `• N.º ${n}: ` + (w>=0 ? `¡GANÓ ${MONEDA} ${PREMIOS[w]}!` : `${counts[n]} de ${TIRADAS} tiradas`); });
    text = `🎱 Bingo Rifa\nCartón de ${c.name}\nSerie: ${c.serie}\nCódigo: ${c.code}\n${lines.join("\n")}`;
  } else {
    text = `🎱 Bingo Rifa\nCartón ${c.serie} de ${c.name} (números ${c.nums.join(", ")})\nTotal: ${MONEDA} ${montoDe(c)}\nPaga por ${PAGO[c.metodo].label}: ${PAGO[c.metodo].datos}\nLuego envía la captura del abono.`;
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

function renderCartones(){
  const box = $("cards"); box.innerHTML = "";
  cartones.forEach(c => {
    const wins = ganados(c), total = wins.reduce((s,n) => s + PREMIOS[winners.indexOf(n)], 0);
    const conf = c.estado === "confirmado", d = document.createElement("div");
    d.className = "ticket" + (wins.length ? " won" : "");
    const cells = c.nums.map(n => {
      let dots = ""; for(let k=0;k<TIRADAS;k++) dots += `<i class="dot${k<counts[n]?" on":""}"></i>`;
      const w = winners.indexOf(n), won = w >= 0 && conf;
      const st = won ? `🏆 ${MONEDA} ${PREMIOS[w]}` : (w >= 0 ? "Completo · falta pago" : `${counts[n]} de ${TIRADAS}`);
      return `<div class="tc${won?" win":""}"><span class="n">${n}</span><span class="dots">${dots}</span><span class="st">${st}</span></div>`;
    }).join("");
    let acciones = "";
    if(c.estado === "comprobante") acciones = `<div class="row"><button class="btn ok" data-ok="${c.id}">✔ Confirmar abono</button><button class="btn sec" data-no="${c.id}">✕ Rechazar</button></div>`;
    if(c.estado !== "confirmado") acciones += `<div class="row"><button class="btn sec" data-proof="${c.id}">📷 ${c.proof ? "Cambiar captura" : "Subir captura del abono"}</button></div>`;
    d.innerHTML =
      `<div class="th"><div><b>${esc(c.name)}</b><small>Serie ${c.serie} · ${c.nums.length} números · ${MONEDA} ${VALE}</small></div><button class="x" data-del="${c.id}" aria-label="Eliminar">✕</button></div>`
      + `<div class="tn">${cells}</div>`
      + (wins.length ? `<p class="tot">¡Ganó ${MONEDA} ${total}!</p>` : "")
      + `<div class="pay"><div class="prow"><span>${PAGO[c.metodo].label} · <b>${MONEDA} ${montoDe(c)}</b></span><span class="badge ${c.estado}">${ESTADOS[c.estado]}</span></div>`
      + (conf ? "" : `<div class="pinfo">${esc(PAGO[c.metodo].datos)}</div>`)
      + (c.proof ? `<img class="proof" data-zoom src="${c.proof}" alt="Captura del abono">` : "")
      + acciones + `</div>`
      + (conf ? `<div class="codes"><div class="white"><svg data-bar="${c.code}"></svg></div><div class="white"><img alt="QR" data-qr="${c.code}"></div></div><p class="note" style="margin:0 0 10px">${c.code}</p>` : "")
      + `<button class="btn sec full" data-share="${c.id}">Compartir por WhatsApp</button>`;
    box.appendChild(d);
  });
  drawCodes();
}
function drawCodes(){
  document.querySelectorAll("svg[data-bar]").forEach(s => {
    try{ JsBarcode(s, s.dataset.bar, {format:"CODE128", width:1.5, height:44, fontSize:12, margin:4}); }catch(e){}
  });
  document.querySelectorAll("img[data-qr]").forEach(im => {
    try{ const q = qrcode(0, "M"); q.addData("BINGO:" + im.dataset.qr); q.make(); im.src = q.createDataURL(4, 2); }catch(e){}
  });
}

// ---- Verificación ----
function verificar(raw){
  const code = String(raw||"").trim().toUpperCase().replace(/^BINGO:/, "");
  const out = $("vOut");
  if(!code){ out.innerHTML = ""; return; }
  const c = cartones.find(x => x.code === code) || cartones.find(x => x.serie === code);
  if(!c){ out.innerHTML = `<div class="vcard bad"><h3>❌ No válido</h3><p>No existe ningún cartón con “${esc(code)}”.</p></div>`; return; }
  const integro = makeCode(c) === c.code, soloSerie = code === c.serie, conf = c.estado === "confirmado";
  const wins = ganados(c), total = wins.reduce((s,n) => s + PREMIOS[winners.indexOf(n)], 0);
  const cls = !integro ? "bad" : (conf && !soloSerie ? "good" : "mid");
  const titulo = !integro ? "❌ Código alterado" : !conf ? "⚠ Cartón sin pago confirmado" : soloSerie ? "⚠ Serie encontrada (pide el código completo)" : "✔ Cartón válido";
  const nums = c.nums.map(n => `${n} (${counts[n]}/${TIRADAS}${winners.includes(n) ? " 🏆" : ""})`).join(" · ");
  out.innerHTML = `<div class="vcard ${cls}"><h3>${titulo}</h3>`
    + `<p><b>${esc(c.name)}</b> · Serie ${c.serie}</p><p>Números: ${nums}</p>`
    + `<p>Pago: ${PAGO[c.metodo].label} · ${MONEDA} ${montoDe(c)} · ${ESTADOS[c.estado]}</p>`
    + (wins.length ? `<p><b>Premio: ${MONEDA} ${total}</b> ${c.entregado ? "· ya entregado ✔" : ""}</p>` : "<p>Sin premio por ahora.</p>")
    + (wins.length && !c.entregado && integro ? `<button class="btn ok" style="width:100%;margin-top:6px" data-ent="${c.id}">Marcar premio entregado</button>` : "")
    + `</div>`;
}
async function escanear(file){
  if(!file) return;
  if(!("BarcodeDetector" in window)){ $("vOut").innerHTML = `<div class="vcard mid"><h3>Escáner no disponible</h3><p>Escribe el código a mano.</p></div>`; return; }
  try{
    const bmp = await createImageBitmap(file);
    const det = new BarcodeDetector({formats:["qr_code","code_128"]});
    const r = await det.detect(bmp);
    if(!r.length){ $("vOut").innerHTML = `<div class="vcard mid"><h3>No se detectó ningún código</h3><p>Intenta otra foto más nítida.</p></div>`; return; }
    $("vCode").value = r[0].rawValue.replace(/^BINGO:/, ""); verificar(r[0].rawValue);
  }catch(e){ $("vOut").innerHTML = `<div class="vcard mid"><h3>No se pudo leer la foto</h3></div>`; }
}

// ---- Render general ----
function render(last){
  const lad = $("ladder"); lad.innerHTML = "";
  PREMIOS.forEach((p,i) => {
    const d = document.createElement("div");
    d.className = "prize" + (i < winners.length ? " won" : i === winners.length ? " next" : "");
    d.innerHTML = `<b>${p}</b><span>${i < winners.length ? "N.º " + winners[i] : MONEDA}</span>`;
    lad.appendChild(d);
  });
  const g = $("grid"); g.innerHTML = "";
  for(let n=1;n<=TOTAL;n++){
    const c = document.createElement("button"), w = winners.indexOf(n), own = ownerOf(n);
    c.className = "cell" + (w>=0 ? " win" : "") + (n===last ? " last" : "");
    if(own){ c.dataset.o = own.name.trim().charAt(0).toUpperCase(); if(own.estado !== "confirmado") c.dataset.p = "1"; }
    let dots = ""; for(let k=0;k<TIRADAS;k++) dots += `<i class="dot${k<counts[n]?" on":""}"></i>`;
    c.innerHTML = `<span class="n">${n}</span><span class="dots">${dots}</span>` + (w>=0 ? `<span class="p">${PREMIOS[w]}</span>` : "");
    c.addEventListener("click", () => { if(addHit(n)){ announce(n); render(n); save(); } });
    g.appendChild(c);
  }
  $("draw").disabled = finished(); $("auto").disabled = finished();
  renderHero(); renderRecent();
  renderCartones();
}

// ---- Panel de estado, bolas recientes y efectos ----
function ballColor(n){
  const C = ["#2f6fe4","#e0364f","#8b4de0","#1fa35c","#f0a91c"];
  return C[Math.min(C.length-1, Math.floor((n-1) / (TOTAL / C.length)))];
}
function renderHero(){
  const vendidos = new Set(), pagados = cartones.filter(c => c.estado === "confirmado");
  cartones.forEach(c => { if(c.estado !== "rechazado") c.nums.forEach(n => vendidos.add(n)); });
  $("hMax").textContent = `${MONEDA} ${Math.max(...PREMIOS)}`;
  $("hPool").textContent = `Pozo total ${MONEDA} ${PREMIOS.reduce((a,b) => a+b, 0)}`;
  $("hSold").textContent = `${vendidos.size}/${TOTAL}`;
  $("hPaid").textContent = pagados.length;
  $("hCash").textContent = `${MONEDA} ${pagados.length * VALE}`;
  $("hBar").style.width = (winners.length / PREMIOS.length * 100) + "%";
  $("hProg").textContent = `${winners.length} de ${PREMIOS.length} premios sorteados`;
}
function renderRecent(){
  $("recent").innerHTML = history.slice(-7).reverse().map((n,i) => `<span class="mini${i===0?" cur":""}" style="--bc:${ballColor(n)}">${n}</span>`).join("");
}
function vibra(p){ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} }
function confetti(){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#e8c36a","#e0457b","#7c3aed","#3ddc97","#fff2b8"];
  for(let i=0;i<36;i++){
    const s = document.createElement("i"); s.className = "cf";
    s.style.left = Math.random()*100 + "vw"; s.style.background = cols[i % cols.length];
    s.style.animationDelay = Math.random()*.4 + "s"; s.style.animationDuration = (1.4 + Math.random()*1.2) + "s";
    document.body.appendChild(s); setTimeout(() => s.remove(), 3200);
  }
}

// ---- Eventos ----
$("vale").textContent = `${MONEDA} ${VALE}`;
updTotal();
$("metodos").innerHTML = Object.values(PAGO).map(p => `<div><b>${p.label}</b>${esc(p.datos)}</div>`).join("");
$("cPay").innerHTML = Object.entries(PAGO).map(([k,p]) => `<option value="${k}">${p.label}</option>`).join("");
$("draw").addEventListener("click", drawRandom);
$("auto").addEventListener("click", toggleAuto);
$("undo").addEventListener("click", undo);
$("reset").addEventListener("click", reset);
$("host").addEventListener("input", save);
$("phone").addEventListener("input", save);
$("cAdd").addEventListener("click", addCarton);
$("cNums").addEventListener("input", updTotal);
$("vBtn").addEventListener("click", () => verificar($("vCode").value));
$("vCode").addEventListener("keydown", e => { if(e.key === "Enter") verificar($("vCode").value); });
$("vScan").addEventListener("click", () => $("vFile").click());
$("vFile").addEventListener("change", e => { escanear(e.target.files[0]); e.target.value = ""; });
$("fProof").addEventListener("change", e => {
  const f = e.target.files[0], id = proofFor; e.target.value = "";
  if(!f || !id) return;
  shrink(f, data => {
    const c = cartones.find(x => String(x.id) === String(id)); if(!c) return;
    c.proof = data; c.estado = "comprobante"; render(); save(); // TODO: subir la captura a un servidor
  });
});
$("cards").addEventListener("click", e => {
  const t = k => e.target.closest(`[data-${k}]`);
  const del = t("del"), sh = t("share"), pr = t("proof"), ok = t("ok"), no = t("no"), zm = t("zoom");
  if(del && confirm("¿Eliminar este cartón?")){ cartones = cartones.filter(x => String(x.id) !== del.dataset.del); render(); save(); }
  if(sh){ const c = cartones.find(x => String(x.id) === sh.dataset.share); if(c) shareCarton(c); }
  if(pr){ proofFor = pr.dataset.proof; $("fProof").click(); }
  if(ok) setEstado(ok.dataset.ok, "confirmado");
  if(no) setEstado(no.dataset.no, "rechazado");
  if(zm){ $("zoom").querySelector("img").src = zm.src; $("zoom").classList.add("on"); }
});
$("zoom").addEventListener("click", () => $("zoom").classList.remove("on"));
$("vOut").addEventListener("click", e => {
  const b = e.target.closest("[data-ent]"); if(!b) return;
  const c = cartones.find(x => String(x.id) === b.dataset.ent);
  if(c){ c.entregado = true; save(); render(); verificar($("vCode").value || c.code); }
});

load();
render(history[history.length-1]);
// TODO: con backend, validar series, códigos y pagos en el servidor (aquí todo vive en este dispositivo)

// ---- Navegación por pestañas ----
function setTab(t){
  document.body.dataset.tab = t;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  window.scrollTo({top:0});
}
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.t)));
setTab("juego");

// ---- Instalación como app (PWA) ----
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("install").hidden = false; });
$("install").addEventListener("click", async () => {
  if(!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install").hidden = true;
});
window.addEventListener("appinstalled", () => { $("install").hidden = true; $("installCard").hidden = true; });
if(matchMedia("(display-mode: standalone)").matches || navigator.standalone) $("installCard").hidden = true;

if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

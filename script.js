// === Configurazione PDF.js (CDN) ===
/* global pdfjsLib */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.js";

// === Elementi DOM ===
const canvas = document.getElementById("pdf-canvas");
const sheet  = document.getElementById("sheet");
const viewer = document.getElementById("viewer");
const pageNumEl   = document.getElementById("page-num");
const pageCountEl = document.getElementById("page-count");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");
const loader  = document.getElementById("loader");
const errorBox= document.getElementById("error");

const ctx = canvas.getContext("2d", { alpha: false });

// === Stato ===
let pdfDoc = null;
let currentPage = 1;
let rendering = false;
let pageViewportBase = null; // viewport con scale 1 dell'attuale pagina, per calcoli responsive

// Permetti override via ?file=... al bisogno, altrimenti Volantino.pdf
const params = new URLSearchParams(location.search);
const pdfUrl = params.get("file") || "Volantino.pdf";

// Utility: mostra/nascondi loader
const setLoading = (isLoading) => {
  loader.hidden = !isLoading;
};

// Calcola scala per riempire la larghezza del contenitore mantenendo qualità su HiDPI
function calcScale(unscaledViewport) {
  const availableW = sheet.clientWidth; // già limitato dal CSS
  const scaleCSS = availableW / unscaledViewport.width;

  // Render retina: moltiplico per DPR al momento del render
  return scaleCSS;
}

// Renderizza una pagina
async function renderPage(num, flipDirection = null) {
  if (!pdfDoc) return;
  rendering = true;
  setLoading(true);
  errorBox.hidden = true;

  try {
    const page = await pdfDoc.getPage(num);

    // Salvo viewport base (scale 1) della pagina corrente
    pageViewportBase = page.getViewport({ scale: 1 });

    // Calcolo scala in CSS e viewport finale considerando DPR
    const scaleCSS = calcScale(pageViewportBase);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const scaledViewport = page.getViewport({ scale: scaleCSS * dpr });

    // Canvas: dimensioni reali (pixel) e CSS
    canvas.width  = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);
    canvas.style.width  = Math.floor(scaledViewport.width / dpr) + "px";
    canvas.style.height = Math.floor(scaledViewport.height / dpr) + "px";

    // Animazione di "sfoglio" sottile
    if (flipDirection === "right") {
      sheet.classList.remove("flip-left");
      // forzo reflow per riattivare la transizione se già presente
      void sheet.offsetWidth;
      sheet.classList.add("flip-right");
    } else if (flipDirection === "left") {
      sheet.classList.remove("flip-right");
      void sheet.offsetWidth;
      sheet.classList.add("flip-left");
    }

    // Render
    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      // migliora qualità testo
      intent: "display",
      enableScripting: false
    }).promise;

    // Ripulisce la classe di flip dopo l'animazione
    window.setTimeout(() => {
      sheet.classList.remove("flip-right", "flip-left");
    }, 380);

    // UI
    currentPage = num;
    pageNumEl.textContent = String(currentPage);
    pageCountEl.textContent = String(pdfDoc.numPages);
    updateButtons();
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Impossibile caricare il PDF. Controlla che 'Volantino.pdf' esista nella stessa cartella.";
    errorBox.hidden = false;
  } finally {
    rendering = false;
    setLoading(false);
  }
}

function updateButtons() {
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = pdfDoc ? currentPage >= pdfDoc.numPages : true;
}

// Coda cambio pagina per evitare tap multipli durante il render
async function goTo(delta) {
  if (!pdfDoc || rendering) return;
  const target = currentPage + delta;
  if (target < 1 || target > pdfDoc.numPages) return;
  renderPage(target, delta > 0 ? "right" : "left");
}

// Eventi frecce
btnPrev.addEventListener("click", () => goTo(-1));
btnNext.addEventListener("click", () => goTo(1));

// Tastiera
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { e.preventDefault(); goTo(-1); }
  if (e.key === "ArrowRight"){ e.preventDefault(); goTo(1); }
});

// Swipe touch (semplice)
let touchX = null, touchY = null, touchTime = 0;
viewer.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touchX = t.clientX; touchY = t.clientY; touchTime = Date.now();
}, {passive:true});
viewer.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchX;
  const dy = t.clientY - touchY;
  const dt = Date.now() - touchTime;
  const absX = Math.abs(dx), absY = Math.abs(dy);

  // swipe orizzontale deciso
  if (dt < 600 && absX > 40 && absX > absY * 1.3) {
    if (dx < 0) goTo(1); else goTo(-1);
  }
  touchX = touchY = null;
}, {passive:true});

// Re-render su resize
let resizeT;
window.addEventListener("resize", () => {
  if (!pdfDoc || !pageViewportBase) return;
  clearTimeout(resizeT);
  resizeT = setTimeout(() => renderPage(currentPage), 120);
});

// Caricamento documento
(async function init(){
  setLoading(true);
  try{
    const task = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/standard_fonts/"
    });

    pdfDoc = await task.promise;
    pageCountEl.textContent = String(pdfDoc.numPages);
    updateButtons();
    renderPage(1);
  }catch(err){
    console.error(err);
    setLoading(false);
    errorBox.textContent = "Non riesco ad aprire il PDF. Assicurati che il file 'Volantino.pdf' sia presente e accessibile.";
    errorBox.hidden = false;
  }
})();

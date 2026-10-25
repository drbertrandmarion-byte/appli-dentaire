// Lecture radiographique (troisieme mode, ouvert a tous depuis que la partie est terminee ;
// l'atelier de trace et le choix du cliche restent a l'enseignante).
//
// Ce que la suite verifie, dans l'ordre :
//   1. Hors ligne, le mode reste ferme a tout le monde — le corrige du serveur n'y est pas
//      charge. Et l'atelier de trace refuse de s'ouvrir pour un compte non enseignant, meme
//      appele directement : un bouton cache n'est pas une porte fermee.
//   2. Le cliche accepte un point depose a l'interieur du contour attendu.
//   3. La marge de contact existe vraiment : un point pose JUSTE A L'EXTERIEUR du contour
//      passe — le point a un rayon visible, le poser au contact designe bien la zone —,
//      le meme pose nettement plus loin est refuse. Sans ces deux mesures symetriques, une
//      tolerance devenue enorme — ou nulle — passerait inapercue.
//   4. Les trois fautes possibles sont comptees separement : repere mal situe, repere
//      oublie, signe pose a tort (leurre).
//   5. Chaque contour garde une taille plausible : ni si vaste qu'il designerait un quart
//      du cliche, ni si menu qu'il faudrait viser au pixel.
//
// Technique : le tirage du cliche est aleatoire, donc Math.random est remplace par un
// generateur a graine (meme procede que tests/confettis.js). Une premiere passe valide
// une lecture vide pour faire reveler par la correction les zones attendues, puis les
// passes suivantes rejouent le MEME cliche avec la meme graine.

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const URL = 'http://localhost:9300/index.html';
const problemes = [];

function ko(msg){ problemes.push(msg); }

async function boot(page, seed){
  await page.addInitScript(([s]) => {
    let x = s;
    Math.random = () => { x = (1103515245 * x + 12345) % 2147483648; return x / 2147483648; };
  }, [seed]);
  await page.goto(URL);
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
}

// Demasque le mode comme le fait enterApp pour un compte enseignant, puis ouvre un cliche.
async function ouvreCliche(page){
  await page.evaluate(() => window.EndoTeacherModes(true));
  await page.waitForTimeout(420);
  await page.click('#hub-radio-btn');
  await page.waitForTimeout(420);
  await page.click('#start-radio-btn');
  await page.waitForTimeout(650); // fondu + scrollIntoView
}

// ---- Ecart entre deux couleurs de legende ----
// La couleur est le SEUL lien entre une entree de la legende et son contour sur le film. Deux
// entrees de teintes voisines rendent ce lien ambigu, et c'est arrive : l'amalgame et le
// composite etaient deux turquoises (#14b8a6 et #06b6d4) sur deux zones mitoyennes de la meme
// dent. L'ecart se mesure donc, en CIE76 sur Lab, qui approche la perception bien mieux que la
// distance entre composantes RVB.
function versLab(rgb){
  const m = rgb.match(/\d+(\.\d+)?/g).map(Number);
  let [r, g, b] = m.slice(0, 3).map(v => v / 255);
  const f = c => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  r = f(r); g = f(g); b = f(b);
  let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let Y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
  let Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const h = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  X = h(X); Y = h(Y); Z = h(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function ecartCouleur(a, b){
  const A = versLab(a), B = versLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
// Plancher calibre sur le defaut reellement trouve : les deux turquoises n'etaient distantes
// que de 28,2. La paire legitime la plus serree du catalogue est a 30,1 — la marge est donc
// mince, et ce plancher protege contre une AGGRAVATION plus qu'il ne garantit du confort.
const ECART_MINI = 30;

// ---- Geometrie des contours, cote test ----
// Le test refait son propre calcul d'appartenance plutot que d'appeler celui de la page :
// deux implementations independantes qui tombent d'accord valent mieux qu'une seule qui se
// confirme elle-meme.
function dansPolygone(poly, x, y){
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function airePolygone(poly){
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a) / 2;
}

// Cherche un croisement entre deux aretes non adjacentes du contour.
function autoIntersection(poly){
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // aretes adjacentes par la fermeture
      const c = poly[j], d = poly[(j + 1) % n];
      const p = croisementSegments(a, b, c, d);
      if (p) return p;
    }
  }
  return null;
}

function croisementSegments(a, b, c, d){
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return { x: a[0] + t * r[0], y: a[1] + t * r[1] };
}

function boite(poly){
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Un point franchement a l'interieur : le centre de gravite tombe dehors sur une forme en U,
// on cherche donc, par echantillonnage, le point interieur le plus eloigne du bord.
function pointInterieur(poly){
  const b = boite(poly);
  let best = null, bestD = -1;
  for (let i = 1; i < 24; i++) {
    for (let j = 1; j < 24; j++) {
      const x = b.x0 + (b.x1 - b.x0) * i / 24;
      const y = b.y0 + (b.y1 - b.y0) * j / 24;
      if (!dansPolygone(poly, x, y)) continue;
      const d = distanceAuBord(poly, x, y);
      if (d > bestD) { bestD = d; best = { x, y, marge: d }; }
    }
  }
  return best;
}

function distanceAuBord(poly, px, py){
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const ex = ax + t * dx - px, ey = ay + t * dy - py;
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

// Un point a une distance donnee a l'EXTERIEUR du contour, pris au milieu d'une arete et
// pousse selon sa normale sortante. Toutes les aretes sont essayees, de la plus longue a la
// plus courte, car la premiere venue peut pointer HORS DU CLICHE : la lesion touche le bord
// gauche et le bord inferieur, et un point lache dehors n'est pas pose du tout — le test
// comptait alors un oubli la ou il attendait un repere mal situe.
function pointExterieur(poly, distance, hU, tousContours){
  const aretes = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len > 1e-6) aretes.push({ ax, ay, bx, by, len });
  }
  aretes.sort((u, v) => v.len - u.len);
  for (const { ax, ay, bx, by, len } of aretes) {
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    for (const sens of [1, -1]) {
      const x = mx + sens * nx * distance, y = my + sens * ny * distance;
      if (x < 8 || x > 352 || y < 8 || y > hU - 8) continue;
      const contours = tousContours || [poly];
      if (contours.some(c => dansPolygone(c, x, y))) continue;
      if (contours.some(c => dansPolygone(c, mx + sens * nx * 1.5, my + sens * ny * 1.5))) continue;
      return { x, y };
    }
  }
  return null;
}

// Les zones attendues ne sont lisibles que dans la correction : on valide donc une lecture
// vide, et on releve les contours traces. Leurs sommets sont lus tels quels — c'est la zone
// que l'etudiant voit, et c'est elle qui doit correspondre a ce que l'application accepte.
async function zonesAttendues(page){
  await page.click('#radio-submit-btn');
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const film = document.getElementById('radio-film').getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.radio-zones polygon[data-rid]').forEach(t => {
      const id = t.getAttribute('data-rid');
      // On lit l'attribut « points » REELLEMENT rendu, pas une declaration parallele : la
      // reference du test est ainsi la forme que l'etudiant voit a l'ecran.
      const poly = t.getAttribute('points').trim().split(/\s+/)
        .map(p => p.split(',').map(Number));
      // Un repere peut avoir PLUSIEURS contours — deux inlay-cores sur un meme cliche. Ils
      // sont rassembles sous son nom : la sonde interieure vise le premier, mais la sonde
      // exterieure doit eviter TOUS les contours, sans quoi elle tomberait dans le second et
      // serait acceptee a juste titre, pendant que le test y verrait une faute.
      const connu = out.find(z => z.id === id);
      if (connu) { connu.contours.push(poly); return; }
      out.push({ id, poly, contours: [poly], W: film.width, H: film.height });
    });
    return out;
  });
}

// Unites du cliche -> fraction du cadre. L'horizontale fait 360 unites de large ; la
// verticale partage la meme echelle, d'ou le rapport largeur/hauteur.
function fraction(z, x, y){
  return { fx: x / 360, fy: (y / 360) * (z.W / z.H) };
}

async function tousLesReperes(page){
  return page.$$eval('.radio-chip', es => es.map(e => e.getAttribute('data-rid')));
}

// La couleur REELLEMENT rendue de chaque pastille, et non la valeur declaree dans le source :
// c'est celle-la que l'etudiant voit, et celle-la qu'il doit relier a un contour.
async function couleursDeLaLegende(page){
  return page.$$eval('.radio-chip', es => es.map(e => ({
    id: e.getAttribute('data-rid'),
    couleur: getComputedStyle(e.querySelector('.dot')).backgroundColor
  })));
}

async function depose(page, rid, fx, fy, dxPx = 0, dyPx = 0){
  const chip = await page.$(`.radio-chip[data-rid="${rid}"]`);
  if (!chip) { ko(`chip introuvable : ${rid}`); return; }
  const cb = await chip.boundingBox();
  const film = await (await page.$('#radio-film')).boundingBox();
  const tx = film.x + fx * film.width + dxPx;
  const ty = film.y + fy * film.height + dyPx;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 6 });
  await page.mouse.up();
}

async function valideEtLis(page){
  await page.click('#radio-submit-btn');
  await page.waitForTimeout(450);
  return page.evaluate(() => ({
    classe: document.getElementById('radio-verdict').className,
    score: document.getElementById('radio-score').textContent.trim(),
    poses: document.querySelectorAll('.radio-pt').length
  }));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
  context.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
  await context.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token: 'test', refresh_token: 'test',
      expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
    }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
      annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true
    }));
  });

  // ---- 0. Les outils du test, eprouves sur des formes connues ----
  // Un detecteur qui ne signale jamais rien ne prouve rien. Celui d'auto-intersection, en
  // particulier, ne se declenche sur aucun contour reel — c'est le resultat attendu, la
  // parametrisation centripete empechant les croisements —, et sans ce controle on ne
  // saurait pas distinguer « rien a signaler » de « detecteur en panne ».
  {
    const noeud = [[0, 0], [10, 10], [10, 0], [0, 10]]; // les deux diagonales se croisent
    const carre = [[0, 0], [10, 0], [10, 10], [0, 10]];
    if (!autoIntersection(noeud)) ko('outils du test : une auto-intersection evidente n\'est pas detectee');
    if (autoIntersection(carre)) ko('outils du test : un carre simple est declare auto-secant');
    if (!dansPolygone(carre, 5, 5)) ko('outils du test : le centre d\'un carre est declare dehors');
    if (dansPolygone(carre, 15, 5)) ko('outils du test : un point hors du carre est declare dedans');
    if (Math.abs(airePolygone(carre) - 100) > 1e-6) ko('outils du test : l\'aire d\'un carre de cote 10 n\'est pas 100');
    if (Math.abs(distanceAuBord(carre, 5, 5) - 5) > 1e-6) ko('outils du test : la distance au bord est fausse');

    // La mesure d'ecart entre couleurs, eprouvee sur le defaut qu'elle existe pour attraper :
    // les deux anciens turquoises de l'amalgame et du composite. Si elle les laissait passer,
    // elle ne protegerait de rien.
    const ancienAmalgame = 'rgb(20, 184, 166)', ancienComposite = 'rgb(6, 182, 212)';
    if (ecartCouleur(ancienAmalgame, ancienComposite) >= ECART_MINI) {
      ko('outils du test : les deux turquoises qui ont motive cette mesure passeraient le seuil (' +
         ecartCouleur(ancienAmalgame, ancienComposite).toFixed(1) + ' >= ' + ECART_MINI + ')');
    }
    if (ecartCouleur('rgb(220, 38, 38)', 'rgb(34, 197, 94)') < ECART_MINI) {
      ko('outils du test : un rouge et un vert franc sont declares trop proches');
    }
    if (ecartCouleur('rgb(120, 120, 120)', 'rgb(120, 120, 120)') !== 0) {
      ko('outils du test : deux couleurs identiques ne sont pas a distance nulle');
    }
  }

  // ---- 1. Hors ligne : le mode reste ferme, et l'atelier refuse de s'ouvrir ----
  // Le mode s'ouvre desormais a tout compte connecte. Il reste cependant ferme HORS LIGNE, a
  // l'enseignante comprise : le corrige du serveur n'y est pas charge, et un etudiant serait
  // note sur des contours perimes. C'est dans cet etat que « boot » place la page, Supabase
  // etant coupe — le bouton doit donc etre cache, et ne pas meme occuper de place.
  {
    const page = await context.newPage();
    await boot(page, 7);
    const etat = await page.evaluate(() => {
      const b = document.getElementById('hub-radio-btn');
      const r = b.getBoundingClientRect();
      return { cache: b.classList.contains('hidden'), aire: r.width * r.height };
    });
    if (!etat.cache) ko('hors ligne, le bouton « lecture radiographique » est visible : le corrige du serveur n\'y serait pas charge');
    if (etat.aire !== 0) ko('hors ligne, le bouton du mode occupe encore de la place a l\'ecran (aire ' + etat.aire + ')');
    // Et le panneau du mode ne doit pas s'ouvrir tout seul.
    const panneau = await page.evaluate(() => document.getElementById('mode-radio-intro').classList.contains('hidden'));
    if (!panneau) ko('le panneau du mode radio est affiche d\'emblee');

    // L'atelier de trace modifie le corrige sur lequel les etudiants sont notes : son bouton
    // doit etre cache, et surtout l'atelier doit REFUSER de s'ouvrir meme appele directement.
    // Un bouton cache n'est pas une porte fermee.
    const atelier = await page.evaluate(() => {
      const b = document.getElementById('radio-trace-btn');
      const avant = document.getElementById('radio-trace-panel').classList.contains('hidden');
      b.click();                       // clic direct, sans passer par l'affichage
      const apres = document.getElementById('radio-trace-panel').classList.contains('hidden');
      return { cache: b.classList.contains('hidden'), ferme: avant && apres };
    });
    if (!atelier.cache) ko('le bouton de l\'atelier de trace est visible pour un compte non enseignant');
    if (!atelier.ferme) ko('l\'atelier de trace s\'ouvre pour un compte non enseignant : le corrige serait modifiable par un etudiant');
    await page.close();
  }

  // ---- 1-cinq. La pastille « Nouveau » tient sur son mot, et au milieu de la carte ----
  // La carte du mode est une colonne flex : un enfant s'y etire sur toute la largeur si on ne
  // dit rien. La pastille, pensee comme un badge arrondi, mesurait donc 650 px de large sur un
  // ecran de bureau, avec le mot plante dans le coin gauche. On mesure les deux choses : sa
  // largeur doit rester proche de celle de son texte, et son centre doit tomber sur celui de la
  // carte. Les deux ecrans comptent — un telephone avait le meme defaut.
  {
    for (const vue of [{ nom: 'bureau', width: 1280, height: 1000 },
                       { nom: 'telephone', width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: vue.width, height: vue.height } });
      ctx.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
      await ctx.addInitScript(() => {
        localStorage.setItem('endodiag-session', JSON.stringify({
          access_token: 'test', refresh_token: 'test',
          expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
        }));
        localStorage.setItem('endodiag-profile', JSON.stringify({
          id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
          annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true
        }));
      });
      const p = await ctx.newPage();
      await boot(p, 11);
      await p.evaluate(() => window.EndoTeacherModes(true, true));
      await p.waitForTimeout(320);

      const m = await p.evaluate(() => {
        const carte = document.getElementById('hub-radio-btn');
        const flag = carte.querySelector('.hub-flag');
        if (!flag) return null;
        // Largeur du seul texte, mesuree par une plage de selection : elle ignore le cadre.
        const plage = document.createRange();
        plage.selectNodeContents(flag);
        const c = carte.getBoundingClientRect(), f = flag.getBoundingClientRect();
        return {
          carteLargeur: c.width, carteCentre: c.left + c.width / 2,
          largeur: f.width, centre: f.left + f.width / 2,
          mot: plage.getBoundingClientRect().width,
          texte: (flag.textContent || '').trim()
        };
      });
      if (!m) {
        ko('pastille (' + vue.nom + ') : .hub-flag est introuvable sur la carte du mode radio');
      } else {
        if (!/^Nouveau$/i.test(m.texte)) {
          ko('pastille (' + vue.nom + ') : elle ne porte plus le mot « Nouveau » mais « ' + m.texte + ' »');
        }
        // Le cadre ajoute ~18 px de remplissage. Au-dela de 40 px de rab, la pastille s'etire.
        if (m.largeur > m.mot + 40) {
          ko('pastille (' + vue.nom + ') : elle s\'etire sur ' + m.largeur.toFixed(0) +
             ' px pour un mot de ' + m.mot.toFixed(0) + ' px — le mot se retrouve dans un coin');
        }
        if (Math.abs(m.centre - m.carteCentre) > 2) {
          ko('pastille (' + vue.nom + ') : son centre est a ' +
             (m.centre - m.carteCentre).toFixed(0) + ' px de celui de la carte, elle n\'est pas centree');
        }
      }
      await ctx.close();
    }
  }

  // ---- 1-zero. La consigne annonce le geste qu'on fait VRAIMENT ----
  // Elle a longtemps commence par « Glissez le point de la legende… ». Le glissement existe et
  // fonctionne — cette suite s'en sert pour tous ses placements — mais ce n'est pas le geste
  // courant, et l'enseignante a du deviner seule qu'il fallait toucher la legende puis la zone.
  // Une consigne qui decrit le geste de secours avant le geste courant laisse chercher.
  {
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const hint = (src.match(/id="radio-hint"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
    const principe = (src.match(/Principe : un cliché est tiré au hasard([\s\S]*?)<\/p>/) || [])[1] || '';
    if (!hint) {
      ko('consigne : le texte de #radio-hint est introuvable, ce controle ne prouverait rien');
    } else {
      if (/^\s*Gliss/i.test(hint)) {
        ko('consigne : elle s\'ouvre encore sur le glissement, qui est le geste de secours');
      }
      // Le geste courant doit y etre, et dans le bon ordre : la legende D'ABORD, la zone ensuite.
      const iLegende = hint.search(/touchez une entrée de la légende/i);
      const iZone    = hint.search(/zone du cliché/i);
      if (iLegende < 0 || iZone < 0 || iLegende > iZone) {
        ko('consigne : elle ne dit pas « toucher la legende, puis la zone » dans cet ordre');
      }
    }
    if (!principe) {
      ko('consigne : le paragraphe « Principe » est introuvable');
    } else if (/faites glisser/i.test(principe)) {
      ko('consigne : le paragraphe d\'accueil annonce encore le glissement comme geste principal');
    }
  }

  // ---- 1quater. Une couleur ne designe qu'une seule legende ----
  // Six teintes servaient a quatorze reperes : le vert valait l'onlay sur un cliche, la racine
  // palatine de 26 sur un autre, la chambre pulpaire de 36 sur un troisieme. La mesure d'ecart
  // ne l'interdisait pas — elle ne regarde qu'a l'interieur d'une meme legende — mais un
  // etudiant qui passe d'un cliche a l'autre y perdait son repere de couleur.
  {
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const cat = src.slice(src.indexOf('var RADIO_REPERES'), src.indexOf('var RADIO_FAMILLES'));
    const par = {};
    let m; const re = /\{id:'([a-z0-9_]+)',\s*label:'((?:[^'\\]|\\.)*)',\s*color:'(#[0-9a-f]+)'/g;
    while ((m = re.exec(cat))) (par[m[3]] = par[m[3]] || []).push(m[2].replace(/\\'/g, "'"));
    const lus = Object.values(par).reduce((n, l) => n + l.length, 0);
    if (lus < 20) ko('couleurs : seulement ' + lus + ' reperes lus, ce controle ne prouverait rien');
    Object.keys(par).forEach(c => {
      if (par[c].length > 1) {
        ko('couleurs : la teinte ' + c + ' designe ' + par[c].length + ' legendes differentes — '
           + par[c].join(' | '));
      }
    });
    // Controle du controle.
    const faux = { '#111111': ['a', 'b'] };
    if (!Object.keys(faux).some(c => faux[c].length > 1)) {
      ko('AUTOCONTROLE : le detecteur de couleur partagee ne voit pas un doublon pose expres');
    }
  }

  // ---- 1bis. Le catalogue de legendes ne doit porter aucun doublon ----
  // Deux entrees qui designent le MEME signe sous deux noms differents est le defaut que
  // l'enseignante a demande de chasser : un etudiant qui a appris l'un ne reconnait pas
  // l'autre, et la meme correction s'ecrit alors de deux facons selon le cliche. Ce qui se
  // mesure mecaniquement se mesure ici ; ce qui releve du sens reste de son ressort.
  {
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const cat = src.slice(src.indexOf('var RADIO_REPERES'), src.indexOf('var RADIO_FAMILLES'));
    const reperes = [];
    const re = /\{id:'([a-z0-9_]+)',\s*label:'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(cat))) reperes.push({ id: m[1], label: m[2].replace(/\\'/g, "'") });
    if (reperes.length < 20) {
      ko('catalogue : seulement ' + reperes.length + ' reperes lus dans la source — la lecture '
         + 'a echoue, et tous les controles de cette section ne prouveraient plus rien');
    }
    const compte = (liste) => liste.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {});
    const doubles = (o) => Object.keys(o).filter(k => o[k] > 1);

    for (const id of doubles(compte(reperes.map(r => r.id)))) {
      ko('catalogue : l\'identifiant « ' + id + ' » est declare deux fois');
    }
    // Deux libelles identiques, ce sont deux pastilles de couleurs differentes portant le
    // meme texte : le cliche designerait deux reponses distinctes avec le meme mot.
    for (const l of doubles(compte(reperes.map(r => r.label.toLowerCase())))) {
      ko('catalogue : le libelle « ' + l +' » est porte par deux reperes differents');
    }
    // Une entree que plus aucun cliche n'emploie est une legende morte : elle ne se voit
    // nulle part, donc rien ne signale qu'elle a diverge du reste.
    const legendes = [];
    const rl = /legende:\[([\s\S]*?)\]/g;
    while ((m = rl.exec(src))) legendes.push((m[1].match(/'([a-z0-9_]+)'/g) || []).map(s => s.replace(/'/g, '')));
    const employes = new Set(legendes.flat());
    for (const r of reperes) {
      if (!employes.has(r.id)) ko('catalogue : « ' + r.label + ' » n\'est utilise par aucun cliche');
    }
    for (let i = 0; i < legendes.length; i++) {
      for (const id of doubles(compte(legendes[i]))) {
        ko('cliche ' + (i + 1) + ' : « ' + id + ' » figure deux fois dans sa propre legende');
      }
      for (const id of legendes[i]) {
        if (!reperes.some(r => r.id === id)) {
          ko('cliche ' + (i + 1) + ' : « ' + id + ' » ne correspond a aucune entree du catalogue');
        }
      }
    }
    // Controle du controle : sans lui, un « aucun doublon » ne distinguerait pas un catalogue
    // sain d'un detecteur en panne.
    if (!doubles(compte(['a', 'b', 'a'])).length) {
      ko('AUTOCONTROLE : le detecteur de doublons ne voit pas une repetition posee exprès');
    }
  }

  // ---- 1ter. Un repere renomme emporte les traces deja publiees ----
  // Fusionner deux legendes renomme un repere. Si la table de reprise est oubliee, le contour
  // que l'enseignante a dessine a la main disparait sans un mot et seule l'ebauche subsiste.
  // Eprouve par le CHEMIN REEL plutot que par la fonction interne : un trace range sous
  // l'ancien nom dans la memoire du navigateur doit ressortir a la correction sous le
  // nouveau, et a sa place — pas a celle de mon ebauche.
  {
    // CONTEXTE A PART. La memoire du navigateur est partagee par toutes les pages d'un meme
    // contexte : seme dans celui des autres sections, ce trace les contaminait, et c'est
    // l'atelier qui tombait en panne trois sections plus loin, pour une raison sans rapport
    // apparent avec lui.
    const ctxM = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
    ctxM.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
    // Carre volontairement loin de l'ebauche declaree, pour que les deux ne puissent pas
    // etre confondus : s'il apparait, c'est bien le trace repris qui est dessine.
    const carre = [[250, 40], [310, 40], [310, 95], [250, 95]];
    await ctxM.addInitScript((c) => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token: 'test', refresh_token: 'test',
        expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
      }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
        annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true
      }));
      localStorage.setItem('endodiag-radio-traces-v1', JSON.stringify({
        endo_composite_fibre: { traitement_radiculaire: c },
        // Le douzieme cliche portait ce repere sous « gutta » : ce second saut doit marcher
        // aussi, sans quoi les contours publies sous ce nom-la seraient perdus.
        gutta_radix:          { gutta: c }
      }));
    }, carre);
    const p = await ctxM.newPage();
    await boot(p, 3);
    await ouvreCliche(p);
    if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
      ko('reprise des traces : la liste enseignante est inatteignable, le cliche 10 ne peut pas etre ouvert');
    } else {
      await p.selectOption('#radio-choix', 'endo_composite_fibre');
      await p.waitForTimeout(500);
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(500);
      const vu = await p.$$eval('#radio-overlay polygon[data-rid]', ns => ns.map(n => ({
        id: n.dataset.rid,
        pts: n.getAttribute('points').split(' ').map(s => s.split(',').map(Number))
      })));
      for (const vieux of ['traitement_radiculaire', 'gutta']) {
        if (vu.some(z => z.id === vieux)) {
          ko('reprise des traces : l\'ancien nom « ' + vieux + ' » est encore dessine');
        }
      }
      const g = vu.find(z => z.id === 'obturation_canalaire');
      if (!g) {
        ko('reprise des traces : rien n\'est dessine pour « obturation_canalaire » sur le dixieme cliche');
      } else {
        const cx = g.pts.reduce((s, p) => s + p[0], 0) / g.pts.length;
        const cy = g.pts.reduce((s, p) => s + p[1], 0) / g.pts.length;
        // Centre du carre seme : (280, 67). L'ebauche declaree est bien plus a gauche et
        // plus bas — une erreur de reprise s'y verrait tout de suite.
        if (Math.abs(cx - 280) > 20 || Math.abs(cy - 67) > 20) {
          ko('reprise des traces : la zone dessinee est centree en (' + cx.toFixed(0) + ', ' +
             cy.toFixed(0) + ') au lieu du trace repris, centre en (280, 67) — le contour '
             + 'dessine a la main sous l\'ancien nom a ete perdu');
        }
      }

      // Le DEUXIEME ancien nom, sur le cliche qui le portait. Une table de reprise qui ne
      // traiterait qu'un des deux sauts passerait le controle precedent sans rien prouver
      // pour l'autre, et les contours publies sous « gutta » seraient perdus en silence.
      await p.selectOption('#radio-choix', 'gutta_radix');
      await p.waitForTimeout(500);
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(500);
      const vu2 = await p.$$eval('#radio-overlay polygon[data-rid]', ns => ns.map(n => ({
        id: n.dataset.rid,
        pts: n.getAttribute('points').split(' ').map(s => s.split(',').map(Number))
      })));
      const g2 = vu2.find(z => z.id === 'obturation_canalaire');
      if (!g2) {
        ko('reprise des traces : rien n\'est dessine pour « obturation_canalaire » sur le douzieme cliche');
      } else {
        const cx = g2.pts.reduce((s, p) => s + p[0], 0) / g2.pts.length;
        const cy = g2.pts.reduce((s, p) => s + p[1], 0) / g2.pts.length;
        if (Math.abs(cx - 280) > 20 || Math.abs(cy - 67) > 20) {
          ko('reprise des traces : le contour publie sous « gutta » n\'est pas repris — zone '
             + 'centree en (' + cx.toFixed(0) + ', ' + cy.toFixed(0) + ') au lieu de (280, 67)');
        }
      }
    }
    await ctxM.close();
  }

  // ---- 2. Le branchement de la porte enseignant, cote source ----
  // Un test en boite noire ne peut pas simuler un compte enseignant (Supabase est coupe) :
  // on verifie donc que l'appel reste bien dans enterApp et que le bouton part cache.
  {
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const enterApp = src.slice(src.indexOf('function enterApp(){'));
    const corps = enterApp.slice(0, enterApp.indexOf('\n  }'));
    // TROIS portes distinctes. Le mode s'ouvre a tout compte connecte ; l'atelier de trace et
    // le choix du cliche restent a l'enseignante. Un appel qui passerait le meme argument aux
    // trois rendrait le corrige modifiable par un etudiant, et remplacerait son tirage par une
    // liste — il reviserait alors le cliche qu'il connait deja.
    if (!/EndoTeacherModes\(accesRadio,\s*accesEnseignante,\s*accesEnseignante\)/.test(corps)) {
      ko('enterApp n\'appelle plus EndoTeacherModes(accesRadio, accesEnseignante, accesEnseignante) : '
         + 'soit le mode ne s\'ouvrirait plus, soit l\'atelier ou le choix du cliche s\'ouvrirait a un etudiant');
    }
    // Le mode ne depend plus d'aucun drapeau de profil — seulement de l'etat hors ligne, qui le
    // ferme a tout le monde. Un reste de « profile.radio » ici signifierait que la porte s'est
    // refermee sur les comptes qui n'ont jamais porte ce drapeau, c'est-a-dire presque tous.
    if (!/var accesRadio\s*=\s*!offline;/.test(corps)) {
      ko('enterApp ne definit plus accesRadio = !offline : le mode n\'est plus ouvert a tous les comptes connectes');
    }
    if (/profile\.radio/.test(corps)) {
      ko('enterApp lit encore le drapeau « radio » du profil, qui n\'a plus cours : le mode serait refuse a qui ne le porte pas');
    }
    // L'enseignante, elle, doit rester seule a pouvoir tracer ET choisir son cliche.
    if (!/var accesEnseignante\s*=\s*!offline && isAdmin;/.test(corps)) {
      ko('enterApp ne reserve plus l\'atelier et le choix du cliche au compte enseignant');
    }
    if (!/<button class="hub-card hidden" id="hub-radio-btn"/.test(src)) {
      ko('le bouton #hub-radio-btn ne part plus cache dans le HTML : un etudiant le verrait le temps du chargement');
    }
    // Meme exigence pour la liste des cliches, et elle ne peut etre eprouvee qu'ici : au
    // chargement, enterApp appelle EndoTeacherModes(false) pour un etudiant et remet la
    // classe. Un test en boite noire voit donc une liste cachee meme si le HTML ne la cache
    // plus — seul reste expose le bref instant AVANT cet appel, que seule la source revele.
    // La mutation qui retirait « hidden » du HTML passait inapercue, c'est ce qui l'a montre.
    if (!/<div class="result-actions radio-pick-row hidden" id="radio-choix-wrap"/.test(src)) {
      ko('la liste #radio-choix-wrap ne part plus cachee dans le HTML : un etudiant la verrait le temps du chargement');
    }
  }

  // ---- 3. Le cliche lui-meme, cas par cas ----
  // Le nombre de cliches n'est pas fige : la suite parcourt des graines et eprouve chaque
  // cliche distinct qu'elle rencontre. Une graine qui ne rapporte rien de nouveau coute une
  // page ; en echange, ajouter une radiographie n'oblige pas a toucher au test.
  // Combien de cliches existent ? L'application le dit. Sans cette liste, la suite ne peut
  // que tirer au hasard et conclure « plus rien de nouveau », ce qui est indiscernable d'un
  // cliche que le tirage ne propose jamais — et un cliche jamais tire est un cliche jamais
  // verifie. C'est arrive : avec trois cliches, deux seulement etaient eprouves.
  let attendus = [];
  {
    const p = await context.newPage();
    await boot(p, 1);
    attendus = await p.evaluate(() => window.EndoRadioCliches || []);
    await p.close();
    if (!attendus.length) ko('l\'application ne declare aucun cliche (window.EndoRadioCliches)');

    // Cette liste ne peut pas etre son propre juge : si elle oubliait un cliche, la suite
    // eprouverait tout ce qu'elle declare et annoncerait « 2 / 2 » alors que la troisieme
    // radiographie n'aurait jamais ete ouverte. La verite tient donc a deux sources que la
    // liste ne controle pas : les images declarees dans le source, et les fichiers presents
    // dans radios/. Les trois doivent coincider.
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const sourceImages = (src.match(/image:'[^']+'/g) || []).map(s => s.slice(7, -1));
    const fichiers = fs.readdirSync(__dirname + '/../radios')
      .filter(f => /\.(png|jpe?g)$/i.test(f))
      .map(f => 'radios/' + f);
    const manquants = sourceImages.filter(i => !attendus.includes(i));
    if (manquants.length) {
      ko('window.EndoRadioCliches passe sous silence ' + manquants.join(', ') +
         ' : ces cliches existent dans RADIO_CASES mais aucun test ne les atteindrait');
    }
    const orphelins = fichiers.filter(f => !sourceImages.includes(f));
    if (orphelins.length) {
      ko('radios/ contient ' + orphelins.join(', ') + ' qu\'aucun cas n\'utilise');
    }
    const introuvables = sourceImages.filter(i => !fichiers.includes(i));
    if (introuvables.length) {
      ko('un cas reclame ' + introuvables.join(', ') + ' qui n\'existe pas sur le disque');
    }
  }

  const vus = new Set();
  let clichesAvecLeurre = 0;
  const GRAINES = 30 * Math.max(1, attendus.length);
  for (let graine = 1; graine <= GRAINES && vus.size < attendus.length; graine++) {
    const seed = graine;

    // Passe A : lecture vide, pour relever les zones attendues de ce cliche.
    const a = await context.newPage();
    await boot(a, seed);
    await ouvreCliche(a);
    // Un cliche s'identifie par SON IMAGE. La consigne, elle, est commune a tous depuis
    // qu'elle est declaree une seule fois : s'en servir ici faisait prendre deux cliches
    // differents pour un seul, et la suite n'en eprouvait qu'un sur deux sans le dire.
    const enonce = await a.getAttribute('#radio-film img', 'src');
    if (!enonce) { ko('aucune image sur le cliche tire'); await a.close(); break; }
    if (vus.has(enonce)) { await a.close(); continue; }
    // Avant la validation, le film est deja nu : une seconde copie n'aurait rien a comparer et
    // ne ferait qu'allonger la page.
    const nuAvant = await a.$eval('#radio-nu', e => e.classList.contains('hidden'));
    const consigne = (await a.textContent('#radio-def')).trim();
    const palette = await couleursDeLaLegende(a);
    const libelles = await a.$$eval('.radio-chip', es => {
      const o = {};
      es.forEach(e => { o[e.getAttribute('data-rid')] = (e.textContent || '').replace(/×\d+$/, '').trim(); });
      return o;
    });
    const zones = await zonesAttendues(a);
    // La lecture doit etre consignee comme n'importe quel cas, sinon le back-office ne voit
    // rien de ce que les etudiants font dans ce mode. Supabase etant coupe, l'enregistrement
    // reste dans la file d'attente du navigateur : c'est la qu'on le lit.
    const file = await a.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('endodiag-pending') || '[]'); }
      catch(e){ return []; }
    });
    const ligne = file.filter(x => x && x.mode === 'radio').slice(-1)[0];
    const attenduId = enonce.split('/').pop().replace(/\.[a-z]+$/i, '');
    if (!ligne) {
      ko('la lecture validee n\'est consignee nulle part : le back-office ne verrait pas ce mode');
    } else if (ligne.diagnosis_id !== attenduId) {
      ko('la lecture est consignee sous « ' + ligne.diagnosis_id + ' » et non sous le cliche lu ('
         + attenduId + ')');
    } else if (ligne.correct !== false) {
      ko('une lecture entierement vide est consignee comme reussie');
    }
    const reperes = await tousLesReperes(a);
    const vide = await a.evaluate(() => ({
      classe: document.getElementById('radio-verdict').className,
      score: document.getElementById('radio-score').textContent.trim()
    }));
    // La copie sans annotation, sous le cliche corrige : la correction recouvre justement ce
    // qu'il faut apprendre a voir, et sans elle l'etudiant n'a plus l'image intacte sous les
    // yeux. Elle doit montrer LE MEME fichier — une copie d'un autre cliche serait pire que
    // pas de copie du tout — et etre visible, ce qu'une largeur nulle dementirait.
    const nu = await a.evaluate(() => {
      const f = document.getElementById('radio-nu'), i = document.getElementById('radio-nu-img');
      if (!f || !i) return null;
      return {
        cache: f.classList.contains('hidden'),
        src: i.getAttribute('src'),
        largeur: i.getBoundingClientRect().width,
        charge: i.naturalWidth
      };
    });
    // Les explications PAR REPERE vivent desormais dans la liste des verdicts, collees sous
    // le repere qu'elles expliquent : elles etaient dans une seconde liste plus bas, et il
    // fallait y retrouver le meme nom pour savoir pourquoi on s'etait trompe.
    // CHAQUE NUMERO DOIT TOMBER DANS SA ZONE. Le centre etait la moyenne des sommets : sur un
    // contour dont les points sont serres d'un cote, elle penche de ce cote-la, et sur une
    // zone creusee elle tombe dehors. L'enseignante l'a vu sur le douzieme cliche, ou le
    // numero de la lesion etait pose sur son bord. LU ICI, page encore ouverte ; juge plus
    // bas, ou l'etiquette du cliche existe.
    const places = await a.evaluate(() => {
      const svg = document.querySelector('#radio-overlay .radio-numeros');
      if (!svg) return null;
      const zones = [].slice.call(document.querySelectorAll(
          '#radio-overlay .radio-zones:not(.radio-numeros) polygon[data-rid]'))
        .map(pg => ({ id: pg.dataset.rid,
                      pts: pg.getAttribute('points').trim().split(/\s+/).map(t => t.split(',').map(Number)) }));
      // Une pastille par contour, emises dans le MEME ORDRE : le numero i appartient au
      // contour i. Se contenter de « dans une zone quelconque » laisserait passer un numero
      // tombe dans la zone du voisin.
      return [].slice.call(svg.querySelectorAll('circle')).map((c, i) => ({
        x: +c.getAttribute('cx'), y: +c.getAttribute('cy'),
        id: (zones[i] || {}).id || null, sienne: (zones[i] || {}).pts || null
      }));
    });

    const lecons = await a.evaluate(() => {
      const l = [].slice.call(document.querySelectorAll('#radio-verdicts li'))
        .filter(li => li.querySelector('.vlecon'))
        .map(li => (li.querySelector('.vlabel').textContent || '').replace(/^\d+\.\s*/, '').trim()
                 + (li.querySelector('.vlecon').textContent || '').trim());
      return l.length ? l : null;
    });
    // Les explications de FAMILLE — la regle qui sert a situer une dent, les tissus de la
    // couronne — sont ecrites une fois pour toutes et ne doivent paraitre qu'une fois par
    // cliche, si un repere de la famille y figure.
    // Chaque ligne de verdict porte une marque lisible d'un coup d'oeil. « bien place » et
    // « pose a cote » se ressemblent trop a la lecture rapide pour qu'on distingue une
    // reussite d'un echec sans les lire en entier. LU ICI, page encore ouverte : le meme
    // controle place plus bas s'executait apres a.close() et emportait toute la suite.
    const marques = await a.evaluate(() => [].slice.call(
      document.querySelectorAll('#radio-verdicts li')).map(li => ({
        ok: li.classList.contains('v-ok'),
        ico: (li.querySelector('.vico') || {}).textContent || ''
      })));
    const familles = await a.evaluate(() => [].slice.call(
      document.querySelectorAll('#radio-lecons-boite .radio-lecon-famille b')
    ).map(e => e.textContent.trim()));
    await a.close();

    vus.add(enonce);
    const etiquette = 'cliche #' + vus.size;

    if (places === null) {
      ko(etiquette + ' : la couche des numeros est absente, leur position n\'est verifiee nulle part');
    } else if (!places.length) {
      ko(etiquette + ' : aucun numero dessine, ce controle ne prouverait rien');
    } else {
      places.forEach((p, i) => {
        if (!p.sienne) {
          ko(etiquette + ' : le numero ' + (i + 1) + ' ne correspond a aucun contour');
        } else if (!dansPolygone(p.sienne, p.x, p.y)) {
          ko(etiquette + ' : le numero de « ' + p.id + ' » est pose HORS de sa propre zone (' +
             p.x.toFixed(0) + ', ' + p.y.toFixed(0) + ')');
        }
      });
    }

    // Deux entrees de la MEME legende ne doivent pas se ressembler : la couleur est le seul
    // lien entre une entree et son contour, et deux teintes voisines rendent ce lien ambigu.
    // La mesure porte sur la legende affichee, cliche par cliche : deux reperes peuvent
    // partager une couleur tant qu'ils ne se rencontrent jamais.
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const d = ecartCouleur(palette[i].couleur, palette[j].couleur);
        if (d < ECART_MINI) {
          ko(etiquette + ' : « ' + palette[i].id + ' » et « ' + palette[j].id +
             ' » portent des couleurs trop voisines (ecart ' + d.toFixed(1) +
             ', plancher ' + ECART_MINI + ') — on ne saurait pas quel contour va avec quelle entree');
        }
      }
    }
    // Les explications de lecture ne doivent porter QUE sur les reperes presents : decrire
    // comment reconnaitre une structure que l'etudiant n'a pas sous les yeux allongerait la
    // correction sans rien lui apprendre de ce cliche-la — et lui ferait croire qu'elle y est.
    if (lecons === null) {
      ko(etiquette + ' : la correction n\'explique aucun repere');
    } else {
      reperes.forEach(id => {
        const present = zones.some(z => z.id === id);
        const cite = lecons.some(t => t.indexOf(libelles[id] || '\u0000') === 0);
        if (!present && cite) {
          ko(etiquette + ' : la correction explique « ' + libelles[id] + ' », qui ne figure PAS sur ce cliche');
        }
      });
    }
    {
      if (!marques.length) {
        ko(etiquette + ' : aucune ligne de verdict, ce controle ne prouverait rien');
      }
      marques.forEach(m => {
        const attendu = m.ok ? '✅' : '❌';
        if (m.ico.trim() !== attendu) {
          ko(etiquette + ' : une ligne ' + (m.ok ? 'reussie' : 'ratee') + ' porte « ' +
             m.ico.trim() + ' » au lieu de « ' + attendu + ' »');
        }
      });
      const doublons = familles.filter((t, i) => familles.indexOf(t) !== i);
      if (doublons.length) {
        ko(etiquette + ' : l\'explication de famille « ' + doublons[0] + ' » est repetee');
      }
      // Un cliche qui nomme une dent doit porter la regle qui permet de la situer.
      const nomme = reperes.some(id => zones.some(z => z.id === id) && /^(dent_|racine_|chambre_|email_)/.test(id));
      if (nomme && !familles.some(t => /Situer une dent/.test(t))) {
        ko(etiquette + ' : ce cliche demande d\'identifier une dent, mais la regle des secteurs n\'est pas rappelee');
      }
      if (!nomme && familles.some(t => /Situer une dent/.test(t))) {
        ko(etiquette + ' : la regle des secteurs est rappelee alors qu\'aucun repere ne nomme de dent');
      }
    }
    if (!nuAvant) ko(etiquette + ' : la copie sans annotation s\'affiche avant la validation, alors que le film est deja nu');
    if (!nu) {
      ko(etiquette + ' : la copie sans annotation du cliche a disparu de la page');
    } else {
      if (nu.cache) ko(etiquette + ' : la correction n\'affiche pas la copie sans annotation du cliche');
      if (nu.src !== enonce) {
        ko(etiquette + ' : la copie sans annotation montre « ' + nu.src + ' » et non le cliche corrige (' + enonce + ')');
      }
      if (!(nu.largeur > 80)) ko(etiquette + ' : la copie sans annotation est rendue sur ' + Math.round(nu.largeur) + ' px de large');
      if (!nu.charge) ko(etiquette + ' : la copie sans annotation n\'a pas charge son image');
    }
    if (!zones.length) { ko(etiquette + ' : aucune zone attendue revelee par la correction'); continue; }
    if (zones.some(z => !z.id)) { ko(etiquette + ' : un contour attendu ne porte pas le nom de son repere'); continue; }
    if (zones.some(z => !z.poly || z.poly.length < 3)) {
      ko(etiquette + ' : un contour attendu a moins de trois sommets — ce n\'est pas une zone'); continue;
    }
    // Un contour est une COURBE echantillonnee, pas un polygone brut : l'application en tire
    // huit points par segment, donc au moins vingt-quatre pour la forme la plus simple
    // possible. En trouver moins signifie que le lissage a saute — l'etudiant verrait alors
    // des angles droits la ou il n'y a pas d'angle droit en anatomie.
    zones.forEach(z => {
      if (z.poly.length < 24) {
        ko(etiquette + ' : le contour de « ' + z.id + ' » n\'a que ' + z.poly.length
           + ' sommets — ce n\'est pas une courbe lissee');
      }
      // Un contour qui se recoupe creuse un trou invisible : a l'interieur de la boucle, la
      // regle pair-impair declare « dehors » et un point correctement pose serait refuse. Le
      // defaut apparait sur un virage trop serre — la pointe d'un tenon, par exemple — et il
      // ne se voit a l'oeil que si la boucle est grosse.
      const croisement = autoIntersection(z.poly);
      if (croisement) {
        ko(etiquette + ' : le contour de « ' + z.id + ' » se recoupe vers ('
           + croisement.x.toFixed(0) + ', ' + croisement.y.toFixed(0)
           + ') — virage trop serre, a decrire par des sommets plus espaces');
      }
    });
    if (!/\bko\b/.test(vide.classe)) ko(etiquette + ' : une lecture entierement vide est comptee comme reussie');
    if (!new RegExp('^0 / ' + zones.length + ' ').test(vide.score)) {
      ko(etiquette + ' : score d\'une lecture vide = « ' + vide.score + ' », attendu « 0 / ' + zones.length + ' … »');
    }

    const leurres = reperes.filter(r => !zones.some(z => z.id === r));
    // Un cliche peut n'avoir AUCUN leurre : l'enseignante a tranche ainsi pour le dixieme, ou
    // les six legendes figurent toutes. C'est pour cela que la consigne dit « pas
    // necessairement ». Les mesures qui ont besoin d'un leurre sont alors passees — mais la
    // suite verifie a la fin qu'au moins un cliche en porte un, sans quoi la regle du « signe
    // pose a tort » ne serait plus eprouvee nulle part.
    if (leurres.length) clichesAvecLeurre++;
    // Et la consigne ne doit pas promettre un leurre quand il n'y en a pas : l'ancienne
    // formule, « Toutes n'y figurent pas », envoyait l'etudiant chercher une legende a ecarter
    // qui n'existait pas sur ce cliche-la.
    if (!leurres.length && !/n'y figurent pas nécessairement/.test(consigne)) {
      ko(etiquette + ' : aucun leurre, mais la consigne affirme que certaines legendes sont '
         + 'absentes — « ' + consigne.slice(-90) + ' »');
    }
    // La legende appartient au CLICHE, pas a l'application : ses repères attendus, plus deux
    // ou trois leurres. Une legende commune a tous grossirait a chaque cliche ajoute — a deux
    // cliches elle comptait deja treize entrees — et un etudiant qui en parcourt treize pour
    // en poser cinq ne lit plus le cliche, il depouille une liste.
    if (leurres.length > 3) {
      ko(etiquette + ' : ' + leurres.length + ' leurres dans la legende (trois au plus) — '
         + 'la legende enfle-t-elle avec les cliches ajoutes ?');
    }
    if (reperes.length > zones.length + 3) {
      ko(etiquette + ' : legende de ' + reperes.length + ' entrees pour ' + zones.length
         + ' reperes attendus');
    }

    // Mesure ABSOLUE de la taille des contours, en part du cliche. Les passes suivantes
    // comparent la zone a elle-meme : si elle etait agrandie dix fois ou reduite a rien,
    // elles pourraient le rater, puisque la sonde suit le contour mesure. Ici la zone est
    // jugee pour ce qu'elle est. Le plafond est fixe au quart du cliche : une lesion etendue
    // en occupe legitimement une large part, mais au-dela une zone ne designe plus rien. Le
    // plancher evite l'inverse, un contour qu'il faudrait viser au pixel.
    const AIRE_FILM = 360 * (zones[0].H / zones[0].W) * 360;
    zones.forEach(z => {
      const part = airePolygone(z.poly) / AIRE_FILM * 100;
      if (part < 0.3 || part > 25) {
        ko(etiquette + ' : le contour de « ' + z.id + ' » couvre ' + part.toFixed(1)
           + ' % du cliche (attendu entre 0,3 et 25)');
      }
    });

    // Chaque zone fournit trois sondes : un point franchement dedans, un point juste au
    // contact du bord, et un point nettement dehors.
    // Un repere peut figurer a plusieurs endroits : il attend alors UN POINT PAR ZONE, et une
    // zone laissee sans point ne compte pas pour acquise. Les sondes interieures sont donc
    // une par contour, les sondes exterieures une seule par repere.
    const sondes = zones.map(z => ({
      z,
      dedans: z.contours.map(c => pointInterieur(c)),
      contact: z.contours.map(c => pointExterieur(c, 4, 360 * z.H / z.W, z.contours)),
      dehors: pointExterieur(z.poly, 34, 360 * z.H / z.W, z.contours)
    }));
    sondes.forEach(s => {
      if (s.dedans.some(p => !p)) ko(etiquette + ' : aucun point interieur trouve pour « ' + s.z.id + ' »');
      if (s.contact.some(p => !p) || !s.dehors) ko(etiquette + ' : aucune sonde exterieure pour « ' + s.z.id + ' »');
    });
    if (sondes.some(s => s.dedans.some(p => !p) || s.contact.some(p => !p) || !s.dehors)) continue;

    // Passe B : tous les reperes attendus, franchement a l'interieur de leur contour.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      if (await p.getAttribute('#radio-film img', 'src') !== enonce) {
        ko(etiquette + ' : la graine ne rejoue pas le meme cliche (passe B)');
        await p.close(); continue;
      }
      let attendus = 0;
      for (const s of sondes) {
        for (const d of s.dedans) { await depose(p, s.z.id, ...Object.values(fraction(s.z, d.x, d.y))); attendus++; }
      }
      const r = await valideEtLis(p);
      if (r.poses !== attendus) ko(etiquette + ' : ' + r.poses + ' point(s) poses sur le cliche au lieu de ' + attendus);
      if (!/\bok\b/.test(r.classe)) ko(etiquette + ' : lecture parfaite refusee — « ' + r.score + ' »');
      if (r.score !== zones.length + ' / ' + zones.length + ' repères présents correctement identifiés.') {
        ko(etiquette + ' : score d\'une lecture parfaite = « ' + r.score + ' »');
      }
      await p.close();
    }

    // Passe C : tous les points poses JUSTE A L'EXTERIEUR du contour. Le point a un rayon
    // visible ; le poser au contact du bord designe bien la zone et doit passer.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      for (const s of sondes) {
        for (const c of s.contact) { await depose(p, s.z.id, ...Object.values(fraction(s.z, c.x, c.y))); }
      }
      const r = await valideEtLis(p);
      if (!/\bok\b/.test(r.classe)) {
        ko(etiquette + ' : un point pose au contact du contour est refuse — « ' + r.score + ' » (la marge de contact ne fonctionne pas)');
      }
      await p.close();
    }

    // Passe C' : la meme sonde poussee nettement plus loin, sur CHAQUE zone. La passe D n'en
    // eprouve qu'une seule par l'exterieur ; une tolerance devenue enorme sur l'une des autres
    // y passerait inapercue.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      for (const s of sondes) {
        const f = fraction(s.z, s.dehors.x, s.dehors.y);
        await depose(p, s.z.id, f.fx, f.fy);
      }
      const r = await valideEtLis(p);
      const attenduLoin = '0 / ' + zones.length + ' repères présents correctement identifiés — '
        + zones.length + ' repères mal situés.';
      if (r.score !== attenduLoin) {
        ko(etiquette + ' : points poses loin des contours — « ' + r.score + ' », attendu « ' + attenduLoin + ' »');
      }
      await p.close();
    }

    // Passe D : les trois fautes, une de chaque — et le point « nettement dehors », qui
    // mesure la limite exterieure de la marge de contact.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      const malSitue = sondes[0];
      const fLoin = fraction(malSitue.z, malSitue.dehors.x, malSitue.dehors.y);
      await depose(p, malSitue.z.id, fLoin.fx, fLoin.fy);
      for (const s of sondes.slice(1, sondes.length - 1)) {
        for (const d of s.dedans) { await depose(p, s.z.id, ...Object.values(fraction(s.z, d.x, d.y))); }
      }
      if (leurres.length) await depose(p, leurres[0], 0.5, 0.5);
      const r = await valideEtLis(p);
      if (!/\bko\b/.test(r.classe)) ko(etiquette + ' : une lecture fautive est comptee comme reussie');
      const attendu = (zones.length - 2) + ' / ' + zones.length
        + ' repères présents correctement identifiés — 1 repère mal situé, 1 repère oublié'
        + (leurres.length ? ', 1 signe posé à tort.' : '.');
      if (r.score !== attendu) {
        ko(etiquette + ' : decompte des fautes = « ' + r.score + ' », attendu « ' + attendu + ' »');
      }
      // La zone mal situee doit etre signalee comme telle, et le leurre comme absent du cliche.
      const detail = await p.$$eval('#radio-verdicts li', es => es.map(e => e.textContent.trim()));
      if (!detail.some(t => /posé à côté de la zone attendue/.test(t))) ko(etiquette + ' : aucun « posé à côté » dans le detail');
      if (leurres.length && !detail.some(t => /n'est pas présent sur ce cliché/.test(t))) {
        ko(etiquette + ' : le leurre n\'est pas signale dans le detail');
      }
      if (!detail.some(t => /oublié/.test(t))) ko(etiquette + ' : l\'oubli n\'est pas signale dans le detail');
      await p.close();
    }

    // ---- Passes E et F : le denombrement, quand un repere figure a plusieurs endroits ----
    // Les passes precedentes posent toujours le bon nombre de points au bon endroit : elles
    // ne peuvent donc rien dire des deux fautes propres au denombrement. Sans ces deux passes,
    // accepter une seule zone sur deux, ou ne plus compter les points du tout, passait
    // inapercu — verifie par mutation.
    const multi = sondes.find(s => s.z.contours.length > 1);
    if (multi) {
      // E : une seule des deux zones repérée. Le repere doit etre compte comme oublie.
      {
        const p = await context.newPage();
        await boot(p, seed);
        await ouvreCliche(p);
        for (const s of sondes) {
          // Pour le repere a plusieurs zones, on n'en pose qu'une seule.
          const aPoser = (s === multi) ? s.dedans.slice(0, 1) : s.dedans;
          for (const d of aPoser) await depose(p, s.z.id, ...Object.values(fraction(s.z, d.x, d.y)));
        }
        const r = await valideEtLis(p);
        const attendu = (zones.length - 1) + ' / ' + zones.length
          + ' repères présents correctement identifiés — 1 repère oublié.';
        if (r.score !== attendu) {
          ko(etiquette + ' : une seule zone sur ' + multi.z.contours.length + ' repérée pour « '
             + multi.z.id + ' » donne « ' + r.score + ' », attendu « ' + attendu + ' »');
        }
        const detailE = await p.$$eval('#radio-verdicts li', es => es.map(e => e.textContent.trim()));
        if (!detailE.some(t => /figure à \d+ endroits/.test(t))) {
          ko(etiquette + ' : le detail ne dit pas combien de zones restaient a reperer');
        }
        await p.close();
      }

      // F : un point de trop sur un repere par ailleurs complet.
      {
        const p = await context.newPage();
        await boot(p, seed);
        await ouvreCliche(p);
        for (const s of sondes) {
          for (const d of s.dedans) await depose(p, s.z.id, ...Object.values(fraction(s.z, d.x, d.y)));
        }
        const enTrop = multi.dedans[0];
        await depose(p, multi.z.id, ...Object.values(fraction(multi.z, enTrop.x + 3, enTrop.y + 3)));
        const r = await valideEtLis(p);
        const attendu = (zones.length - 1) + ' / ' + zones.length
          + ' repères présents correctement identifiés — 1 repère mal situé.';
        if (r.score !== attendu) {
          ko(etiquette + ' : un point de trop sur « ' + multi.z.id + ' » donne « ' + r.score
             + ' », attendu « ' + attendu + ' »');
        }
        await p.close();
      }
    }
  }

  // Un cliche jamais tire est un cliche jamais verifie : on le nomme, comme le fait la suite
  // du choix therapeutique avec ses cas nommes.
  const jamaisTires = attendus.filter(src => ![...vus].some(v => v.indexOf(src) !== -1));
  if (jamaisTires.length) {
    ko('cliches jamais tires en ' + GRAINES + ' graines, donc jamais verifies : ' + jamaisTires.join(', '));
  }

  // ---- 3bis. L'atelier de trace : le zoom ne doit pas decaler les sommets ----
  // C'est le risque propre au zoom : un sommet qui se poserait ailleurs qu'ou l'on clique.
  // On pose donc le MEME point de l'image a deux grossissements differents, et on compare.
  {
    const p = await context.newPage();
    await boot(p, 5);
    await p.evaluate(() => { window.EndoAccount.isAdmin = true; });
    await ouvreCliche(p);
    await p.click('#radio-trace-btn');
    await p.waitForTimeout(450);
    const ouvert = await p.evaluate(() => !document.getElementById('radio-trace-panel').classList.contains('hidden'));
    if (!ouvert) {
      ko('atelier : il ne s\'ouvre pas pour un compte enseignant');
    } else {
      const rid = (await tousLesReperes(p))[0];

      // Le meme point de l'image, vise a travers deux grossissements.
      const sommets = [];
      for (const zoom of [1, 3]) {
        await p.click(`.radio-chip[data-rid="${rid}"]`);
        await p.waitForTimeout(120);
        await p.click('#radio-trace-clear');
        await p.waitForTimeout(120);
        await p.click('#radio-zoom-reset');
        await p.waitForTimeout(120);
        for (let i = 1; i < zoom; i++) { await p.click('#radio-zoom-plus'); await p.click('#radio-zoom-plus'); }
        await p.waitForTimeout(150);
        const st = await (await p.$('#radio-stage')).boundingBox();
        await p.mouse.click(st.x + st.width / 2, st.y + st.height / 2);
        await p.waitForTimeout(200);
        sommets.push(await p.evaluate(([id]) => {
          const t = JSON.parse(localStorage.getItem('endodiag-radio-traces-v1') || '{}');
          const cas = Object.values(t)[0] || {};
          return (cas[id] || []).slice(-1)[0] || null;
        }, [rid]));
      }
      if (!sommets[0] || !sommets[1]) {
        ko('atelier : un clic sur le cliche ne pose pas de sommet');
      } else {
        const ecart = Math.hypot(sommets[0][0] - sommets[1][0], sommets[0][1] - sommets[1][1]);
        if (ecart > 4) {
          ko('atelier : le meme point vise a x1 et a x3 donne ('
             + sommets[0] + ') et (' + sommets[1] + ') — le zoom decale les sommets de '
             + ecart.toFixed(1) + ' unites');
        }
      }

      // Seul le compte enseignant ENREGISTRE. La garde de l'ouverture ne suffit pas : on
      // verifie ici qu'un compte qui atteindrait l'atelier par un autre chemin n'ecrirait
      // rien. Le corrige note tous les etudiants, il ne se modifie que depuis le compte qui
      // en repond.
      {
        await p.click('#radio-trace-clear');
        await p.waitForTimeout(150);
        const st0 = await (await p.$('#radio-stage')).boundingBox();
        await p.mouse.click(st0.x + st0.width * 0.4, st0.y + st0.height * 0.4);
        await p.waitForTimeout(200);
        const avant = await p.evaluate(() => localStorage.getItem('endodiag-radio-traces-v1'));
        if (!avant) ko('atelier : rien n\'est enregistre meme pour le compte enseignant');
        // Le compte devient « acces radio » sans etre enseignant, l'atelier restant ouvert.
        await p.evaluate(() => { window.EndoAccount.isAdmin = false; window.EndoAccount.accesRadio = true; });
        await p.mouse.click(st0.x + st0.width * 0.6, st0.y + st0.height * 0.6);
        await p.waitForTimeout(200);
        const apres = await p.evaluate(() => localStorage.getItem('endodiag-radio-traces-v1'));
        if (apres !== avant) {
          ko('atelier : un compte non enseignant a enregistre une modification du corrige');
        }
        await p.evaluate(() => { window.EndoAccount.isAdmin = true; });
      }

      // Un glissement deplace le cliche, il ne pose pas de sommet.
      await p.click('#radio-trace-clear');
      await p.waitForTimeout(150);
      const st = await (await p.$('#radio-stage')).boundingBox();
      await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
      await p.mouse.down();
      await p.mouse.move(st.x + st.width / 2 - 70, st.y + st.height / 2 - 50, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(200);
      const apres = await p.evaluate(([id]) => {
        const t = JSON.parse(localStorage.getItem('endodiag-radio-traces-v1') || '{}');
        const cas = Object.values(t)[0] || {};
        return (cas[id] || []).length;
      }, [rid]);
      if (apres !== 0) ko('atelier : un glissement pose un sommet au lieu de deplacer le cliche');
    }
    await p.close();
  }

  // ---- 2bis. L'etudiant connecte : le mode, mais ni l'atelier ni le choix du cliche ----
  // C'est le cas ORDINAIRE depuis que la partie est terminee, et il tient en trois portes
  // distinctes. Confondues, l'etudiant recevrait soit l'atelier — et le corrige sur lequel
  // tous sont notes deviendrait modifiable par n'importe qui —, soit la liste des cliches,
  // qui remplacerait son tirage et le laisserait reviser celui qu'il connait deja.
  {
    const p = await context.newPage();
    await boot(p, 4);
    // L'etat exact du compte a reproduire : connecte, valide, pas enseignant. C'est ce que
    // « enterApp » fait d'un etudiant en ligne. Sans poser isAdmin a false explicitement, la
    // garde de l'atelier refuserait pour la mauvaise raison — parce que le compte n'a RIEN.
    await p.evaluate(() => {
      window.EndoAccount = Object.assign({}, window.EndoAccount, { isAdmin: false, accesRadio: true });
      window.EndoTeacherModes(true, false, false);
    });
    await p.waitForTimeout(420);
    const vu = await p.evaluate(() => {
      const aire = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
      const b = document.getElementById('hub-radio-btn');
      const t = document.getElementById('radio-trace-btn');
      const c = document.getElementById('radio-choix-wrap');
      return { mode: !b.classList.contains('hidden'), trace: !t.classList.contains('hidden'),
               choix: !c.classList.contains('hidden'),
               aireTrace: aire(t), aireChoix: aire(c) };
    });
    if (!vu.mode)  ko('etudiant connecte : le mode de lecture radiographique ne s\'ouvre pas');
    if (vu.trace)  ko('etudiant connecte : le bouton de l\'atelier est visible — le corrige serait modifiable');
    if (vu.aireTrace !== 0) ko('etudiant connecte : le bouton de l\'atelier occupe encore de la place a l\'ecran');
    if (vu.choix)  ko('etudiant connecte : le choix du cliche est ouvert — son tirage serait remplace par une liste');
    if (vu.aireChoix !== 0) ko('etudiant connecte : la liste des cliches occupe encore de la place a l\'ecran');

    // Et le forcer ne doit rien ouvrir : l'atelier a sa propre garde, qui ne regarde que le
    // compte enseignant.
    await p.click('#hub-radio-btn');
    await p.waitForTimeout(400);
    await p.click('#start-radio-btn');
    await p.waitForTimeout(650);
    const force = await p.evaluate(() => {
      const t = document.getElementById('radio-trace-btn');
      t.classList.remove('hidden');
      t.click();
      return document.getElementById('radio-trace-panel').classList.contains('hidden');
    });
    if (!force) ko('acces lecture seule : demasquer le bouton de l\'atelier suffit a l\'ouvrir');
    await p.close();
  }

  // ---- 3quinquies. Le corrige partage : ce que l'enseignante retrace vaut pour tous ----
  // Les contours declares dans le code ne sont qu'un point de depart ; ceux qu'elle retrace
  // font foi et doivent valoir pour TOUTES les sessions. Trois choses a prouver : le corrige
  // du serveur l'emporte sur le contour declare ; un repere absent du corrige garde le sien ;
  // et seul le compte enseignant ecrit.
  {
    // 1. Relever, serveur injoignable, l'identifiant du premier cliche et d'un de ses reperes.
    const a = await context.newPage();
    await boot(a, 2);
    await a.evaluate(() => window.EndoTeacherModes(true));
    await a.waitForTimeout(420);
    await a.click('#hub-radio-btn'); await a.waitForTimeout(420);
    await a.click('#start-radio-btn'); await a.waitForTimeout(650);
    const premier = await a.$eval('#radio-choix option:nth-child(2)', o => o.value);
    await a.selectOption('#radio-choix', premier);
    await a.waitForTimeout(600);
    const zonesDeclarees = await zonesAttendues(a);
    await a.close();
    if (zonesDeclarees.length < 2) {
      ko('corrige partage : le premier cliche n\'a pas deux reperes, le test ne peut rien comparer');
    } else {
      const vise = zonesDeclarees[0].id, temoin = zonesDeclarees[1].id;
      // Un carre franc, loin de tout contour declare.
      const carre = [[40, 40], [120, 40], [120, 120], [40, 120]];

      // 2. Le meme cliche, mais le serveur repond cette fois.
      const b = await context.newPage();
      await b.route('**/rest/v1/radio_traces*', route => {
        if (route.request().method() !== 'GET') return route.fulfill({ status: 201, body: '' });
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([{ case_id: premier, zones: { [vise]: [carre] } }])
        });
      });
      await boot(b, 2);
      await b.evaluate(() => window.EndoTeacherModes(true));
      await b.waitForTimeout(420);
      await b.click('#hub-radio-btn'); await b.waitForTimeout(700);
      await b.click('#start-radio-btn'); await b.waitForTimeout(650);
      await b.selectOption('#radio-choix', premier);
      await b.waitForTimeout(800);
      const zonesServeur = await zonesAttendues(b);

      const recu = zonesServeur.filter(z => z.id === vise)[0];
      if (!recu) {
        ko('corrige partage : le repere corrige par le serveur a disparu de la correction');
      } else {
        // Les sommets lus sur le SVG sont DEJA en unites du cliche : son viewBox est
        // exprime dans le meme repere que les coordonnees des contours.
        const xs = recu.poly.map(p => p[0]);
        const ys = recu.poly.map(p => p[1]);
        const dans = Math.min(...xs) > 25 && Math.max(...xs) < 135
                  && Math.min(...ys) > 25 && Math.max(...ys) < 135;
        if (!dans) {
          ko('corrige partage : le contour de « ' + vise + ' » ne suit pas celui du serveur — '
             + 'x ' + Math.min(...xs).toFixed(0) + '..' + Math.max(...xs).toFixed(0)
             + ', y ' + Math.min(...ys).toFixed(0) + '..' + Math.max(...ys).toFixed(0)
             + ' (attendu dans 40..120)');
        }
      }
      // Le temoin, absent du corrige recu, doit garder son contour declare.
      const avant = zonesDeclarees.filter(z => z.id === temoin)[0];
      const apres = zonesServeur.filter(z => z.id === temoin)[0];
      if (!apres) {
        ko('corrige partage : un repere absent du corrige du serveur a perdu son contour declare');
      } else if (avant && Math.abs(airePolygone(avant.poly) - airePolygone(apres.poly)) > 1) {
        ko('corrige partage : le corrige du serveur a modifie « ' + temoin + ' », qu\'il ne mentionne pas');
      }
      await b.close();
    }
  }

  // ---- 3sexies. Qui ECRIT le corrige partage ----
  {
    for (const cas of [{ nom: 'enseignant', admin: true, attendu: true },
                       { nom: 'acces radio sans etre enseignant', admin: false, attendu: false }]) {
      const p = await context.newPage();
      const envois = [];
      await p.route('**/rest/v1/radio_traces*', route => {
        if (route.request().method() !== 'GET') envois.push(route.request().method());
        route.fulfill({ status: route.request().method() === 'GET' ? 200 : 201,
                        contentType: 'application/json',
                        body: route.request().method() === 'GET' ? '[]' : '' });
      });
      await boot(p, 6);
      await p.evaluate(a => {
        window.EndoAccount = Object.assign({}, window.EndoAccount, { isAdmin: a, accesRadio: true });
        window.EndoTeacherModes(true, true);
      }, cas.admin);
      await p.waitForTimeout(420);
      await p.click('#hub-radio-btn'); await p.waitForTimeout(500);
      await p.click('#start-radio-btn'); await p.waitForTimeout(650);
      await p.click('#radio-trace-btn'); await p.waitForTimeout(450);
      const rid = (await tousLesReperes(p))[0];
      await p.click(`.radio-chip[data-rid="${rid}"]`); await p.waitForTimeout(120);
      const st = await (await p.$('#radio-stage')).boundingBox();
      await p.mouse.click(st.x + st.width / 2, st.y + st.height / 2);
      await p.waitForTimeout(1800); // le delai d'attente avant publication
      if (cas.attendu && !envois.length) {
        ko('corrige partage : un trace du compte enseignant n\'est pas publie');
      }
      if (!cas.attendu && envois.length) {
        ko('corrige partage : un compte non enseignant a ecrit sur le corrige partage (' + envois.join(', ') + ')');
      }
      await p.close();
    }
  }

  // ---- 3quater. L'atelier et les reperes declares ABSENTS du cliche ----
  // Rien n'empeche d'y tracer un leurre, mais son contour n'est jamais dessine a la
  // correction, qui ne parcourt que les reperes attendus : le trace disparaissait alors sans
  // un mot, et l'enseignante a cru deux soirees de suite que l'enregistrement echouait. Le
  // partage attendu/absent est etabli ICI par une lecture vide sur une page a part, et non
  // demande a l'atelier : c'est la meme source de verite que le reste de la suite.
  {
    // Le cliche est choisi par la LISTE enseignante et non par le tirage : des cliches sans
    // aucun leurre existent desormais, et une graine qui tombait sur l'un d'eux faisait
    // echouer la mesure pour une raison qui n'avait rien a voir avec ce qu'elle eprouve.
    const ref = await context.newPage();
    await boot(ref, 11);
    await ouvreCliche(ref);
    const options = await ref.$$eval('#radio-choix option', os => os.map(o => o.value).filter(Boolean));
    let choisi = null, attendusIci = null;
    for (const opt of options) {
      await ref.selectOption('#radio-choix', opt);
      await ref.waitForTimeout(550);
      const chips = await tousLesReperes(ref);
      const zs = (await zonesAttendues(ref)).map(z => z.id);
      if (chips.some(id => !zs.includes(id))) { choisi = opt; attendusIci = zs; break; }
    }
    await ref.close();
    if (!choisi) {
      ko('atelier : aucun cliche ne porte de leurre, l\'avertissement n\'a pas pu etre eprouve');
    } else {

    const p = await context.newPage();
    await boot(p, 11);
    await p.evaluate(() => { window.EndoAccount.isAdmin = true; });
    await ouvreCliche(p);
    await p.selectOption('#radio-choix', choisi);
    await p.waitForTimeout(600);
    await p.click('#radio-trace-btn');
    await p.waitForTimeout(450);
    const tous = await tousLesReperes(p);
    const leurresIci = tous.filter(id => !attendusIci.includes(id));
    for (const id of tous) {
      await p.click(`.radio-chip[data-rid="${id}"]`);
      await p.waitForTimeout(90);
      const etat = await p.$eval('#radio-trace-cible',
        e => ({ alerte: e.classList.contains('radio-alerte'), texte: e.textContent }));
      const devrait = !attendusIci.includes(id);
      if (devrait && !etat.alerte) {
        ko('atelier : « ' + id + ' » est declare absent du cliche et rien ne le dit — son trace '
           + 'resterait sans effet a la correction');
      }
      if (!devrait && etat.alerte) {
        ko('atelier : « ' + id + ' » est attendu sur ce cliche mais l\'atelier le declare absent');
      }
      if (devrait && etat.alerte && !/ABSENT/.test(etat.texte)) {
        ko('atelier : l\'avertissement ne dit pas que le repere est absent du cliche');
      }
      if (!devrait && !/Tracé en cours/.test(etat.texte)) {
        ko('atelier : un repere attendu ne s\'annonce pas par « Tracé en cours »');
      }
    }
    if (!leurresIci.length) {
      ko('atelier : le cliche choisi ne porte aucun leurre alors qu\'il en portait a la lecture');
    }
    await p.close();
    }
  }

  // ---- 3ter. Le choix du cliche, reserve a l'enseignante ----
  // Elle doit pouvoir ouvrir le cliche qu'elle corrige sans attendre que le tirage le propose.
  // Deux choses a prouver : le choix est obei (et tenu d'un cliche au suivant), et il reste
  // hors de portee d'un etudiant — y compris s'il forcait la valeur de la liste cachee, ce
  // qu'un simple test d'affichage ne verrait pas.
  {
    const p = await context.newPage();
    await boot(p, 1);
    await ouvreCliche(p);

    const ouverte = () => p.getAttribute('#radio-film img', 'src');
    const options = await p.$$eval('#radio-choix option', os => os.map(o => o.value));
    if (options.length !== attendus.length + 1) {
      ko('liste enseignante : ' + (options.length - 1) + ' cliche(s) proposes pour ' +
         attendus.length + ' declares');
    }
    if (options[0] !== '') ko('liste enseignante : le tirage au hasard n\'est plus propose en tete');
    if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
      ko('liste enseignante : elle reste cachee alors que le mode enseignant est ouvert');
    }

    // Chaque cliche declare doit etre atteignable par son entree de liste.
    for (const id of options.slice(1)) {
      // La liste doit etre atteignable a chaque tour. Sans ce controle, une liste disparue en
      // cours de route faisait echouer le selectOption suivant sur un timeout Playwright :
      // la suite s'interrompait sans jamais dire ce qui n'allait pas, et le ko deja enregistre
      // partait avec elle. Un test doit nommer le defaut, pas planter dessus.
      if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
        ko('liste enseignante : elle a disparu en cours de route, les cliches suivants sont inatteignables');
        break;
      }
      await p.selectOption('#radio-choix', id);
      await p.waitForTimeout(500);
      const vue = await ouverte();
      if (!attendus.includes(vue)) ko('liste enseignante : « ' + id + ' » ouvre une image inconnue (' + vue + ')');
      // Volontairement, ce cliche n'est PAS compte dans « vus » : l'ouvrir par la liste ne
      // prouve pas que la section 3 en a eprouve la geometrie. Le compteur de couverture ne
      // doit mesurer que ce que le tirage a reellement propose.

      // « Nouveau cliche » doit RENDRE LA MAIN AU TIRAGE. Le contraire a ete teste ici
      // pendant un temps — le choix survivait d'un tour a l'autre — et c'etait une erreur
      // de conception : le bouton rouvrait indefiniment le meme film et paraissait sans
      // effet. Le choix vaut pour le cliche qu'on ouvre, pas pour tous les suivants.
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(400);
      if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
        ko('liste enseignante : elle disparait apres la validation, le cliche suivant redevient introuvable');
      }
      // La copie sans annotation doit suivre le cliche d'un tour a l'autre. Les passes de la
      // section 3 repartent chacune d'une page neuve : elles ne verraient jamais une copie
      // restee en place apres « Nouveau cliche », qui montrerait alors le cliche precedent
      // pendant qu'on lit le suivant.
      if (await p.$eval('#radio-nu', e => e.classList.contains('hidden'))) {
        ko('copie sans annotation : absente de la correction de « ' + id + ' »');
      }
      await p.click('#radio-next-btn');
      await p.waitForTimeout(500);
      if (!await p.$eval('#radio-nu', e => e.classList.contains('hidden'))) {
        ko('copie sans annotation : elle reste affichee apres « Nouveau cliche », avant toute validation');
      }
      const suivant = await ouverte();
      if (suivant === vue) {
        ko('liste enseignante : « Nouveau cliche » rouvre le cliche choisi (' + vue + ') au lieu de retirer au sort');
      }
      if (!attendus.includes(suivant)) {
        ko('liste enseignante : « Nouveau cliche » ouvre une image inconnue (' + suivant + ')');
      }
      // La liste doit afficher « Tirage au hasard » : sinon elle annonce un cliche qui n'est
      // plus a l'ecran, et on tracerait sur un film en croyant travailler sur un autre.
      const reste = await p.$eval('#radio-choix', s => s.value);
      if (reste !== '') ko('liste enseignante : apres « Nouveau cliche » elle montre encore « ' + reste +' »');
      const dit = await p.textContent('#radio-choix-actuel');
      if (!dit || dit.indexOf(suivant.split('/').pop()) < 0) {
        ko('liste enseignante : la ligne « a l\'ecran » n\'annonce pas ' + suivant + ' (lu : ' + dit + ')');
      }
    }

    // Revenir au hasard doit rendre la main au tirage — pour autant que la liste soit encore
    // la : sinon ce dernier selectOption echouerait sur un timeout et emporterait le rapport.
    if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
      ko('liste enseignante : elle a disparu, le retour au tirage au hasard est hors d\'atteinte');
    } else {
      await p.selectOption('#radio-choix', '');
      await p.waitForTimeout(500);
      if (!attendus.includes(await ouverte())) ko('liste enseignante : le retour au tirage au hasard n\'ouvre aucun cliche connu');
    }
    await p.close();
  }

  // ---- 3septies. Le tirage epuise les cliches avant d'en reproposer un ----
  // Au hasard pur, revoir deux fois le meme film en trois tours est banal, et un cliche que
  // le sort n'a jamais propose reste un cliche jamais travaille. Le tirage vide donc un sac
  // avant de le rebattre. Deux choses a prouver : aucun doublon a l'interieur d'un sac, et
  // pas de doublon non plus au raccord entre deux sacs.
  {
    const p = await context.newPage();
    await boot(p, 11);
    await ouvreCliche(p);
    const N = attendus.length;
    const suite = [await p.getAttribute('#radio-film img', 'src')];
    for (let i = 0; i < 2 * N - 1; i++) {
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(160);
      await p.click('#radio-next-btn');
      await p.waitForTimeout(320);
      suite.push(await p.getAttribute('#radio-film img', 'src'));
    }
    const sac1 = suite.slice(0, N), sac2 = suite.slice(N);
    const doublons = l => l.length - new Set(l).size;
    if (doublons(sac1)) {
      ko('tirage : ' + doublons(sac1) + ' doublon(s) dans les ' + N + ' premiers tours — un cliche revient avant que tous soient passes');
    }
    if (new Set(sac1).size !== N) {
      ko('tirage : seulement ' + new Set(sac1).size + ' cliches distincts sur ' + N + ' en ' + N + ' tours');
    }
    if (doublons(sac2)) {
      ko('tirage : ' + doublons(sac2) + ' doublon(s) dans le deuxieme tour complet');
    }
    if (suite[N] === suite[N - 1]) {
      ko('tirage : le meme cliche au raccord entre deux series (' + suite[N] + ' deux fois de suite)');
    }
    // Controle du controle : la meme mesure sur une suite deliberement fautive doit crier.
    // Sans lui, un « 0 doublon » ne prouverait pas que le detecteur fonctionne.
    const faux = attendus.slice(0, N - 1).concat([attendus[0]]);
    if (!doublons(faux)) ko('AUTOCONTROLE : le detecteur de doublons ne voit pas une repetition posee exprès');
    await p.close();
  }

  {
    // Cote etudiant : la liste est absente, et la forcer ne doit rien imposer. Le tirage
    // n'etant pas sous controle ici, ce qui est verifie est qu'il reste un tirage : on force
    // la valeur sur un cliche, et sur plusieurs tours l'application ne s'y fixe pas.
    const p = await context.newPage();
    await boot(p, 7);
    await p.evaluate(() => { document.getElementById('hub-radio-btn').classList.remove('hidden'); });
    await p.click('#hub-radio-btn');
    await p.waitForTimeout(420);
    await p.click('#start-radio-btn');
    await p.waitForTimeout(650);
    if (!await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
      ko('liste enseignante : un etudiant la voit');
    }
    const force = attendus[attendus.length - 1];
    const cible = await p.evaluate((img) => {
      const o = [].slice.call(document.querySelectorAll('#radio-choix option'))
        .filter(o => o.textContent.indexOf(img.split('/').pop()) >= 0)[0];
      if (o) document.getElementById('radio-choix').value = o.value;
      return o ? o.value : null;
    }, force);
    if (!cible) ko('liste enseignante : impossible de retrouver l\'entree de ' + force + ' pour l\'eprouver');
    let autres = 0;
    for (let i = 0; i < 12; i++) {
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(250);
      await p.click('#radio-next-btn');
      await p.waitForTimeout(400);
      if (await p.getAttribute('#radio-film img', 'src') !== force) autres++;
    }
    if (!autres) {
      ko('liste enseignante : un etudiant qui force la valeur de la liste cachee impose son cliche');
    }
    await p.close();
  }

  // ---- 4. Les gestes : poser, reprendre, retirer ----
  // Un point qui se deposerait hors du cliche, ou qu'on ne pourrait plus retirer, rendrait
  // l'exercice inutilisable sans rien casser dans le decompte des fautes.
  {
    const p = await context.newPage();
    await boot(p, 3);
    await ouvreCliche(p);
    const rid = (await tousLesReperes(p))[0];
    const compte = () => p.$$eval('.radio-pt', es => es.length);

    // a) lache hors du cliche depuis la legende : rien ne doit etre pose
    const chip = await p.$(`.radio-chip[data-rid="${rid}"]`);
    const cb = await chip.boundingBox();
    await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await p.mouse.down();
    await p.mouse.move(8, 8, { steps: 6 });
    await p.mouse.up();
    if (await compte() !== 0) ko('gestes : un point lache en dehors du cliche a quand meme ete pose');

    // b) depose normale
    await depose(p, rid, 0.5, 0.5);
    if (await compte() !== 1) ko('gestes : le point depose au centre du cliche n\'apparait pas');

    // c) deplacement : le point suit, sans se dupliquer
    const film = await (await p.$('#radio-film')).boundingBox();
    await p.mouse.move(film.x + film.width * 0.5, film.y + film.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(film.x + film.width * 0.3, film.y + film.height * 0.3, { steps: 6 });
    await p.mouse.up();
    if (await compte() !== 1) ko('gestes : deplacer un point posé le duplique ou le supprime');

    // d) simple toucher sur un point pose : il repart dans la legende
    await p.mouse.move(film.x + film.width * 0.3, film.y + film.height * 0.3);
    await p.mouse.down();
    await p.mouse.up();
    if (await compte() !== 0) ko('gestes : toucher un point posé ne le retire pas');

    // e) repli tactile : un toucher sur la legende puis un clic sur le cliche
    await p.click(`.radio-chip[data-rid="${rid}"]`);
    await p.waitForTimeout(60);
    const selectionne = await p.$$eval('.radio-chip.sel', es => es.length);
    if (selectionne !== 1) ko('gestes : toucher un repere de la legende ne le selectionne pas');
    await p.mouse.click(film.x + film.width * 0.6, film.y + film.height * 0.6);
    await p.waitForTimeout(60);
    if (await compte() !== 1) ko('gestes : repli tactile — le clic sur le cliche ne pose pas le repere selectionne');

    // f) la legende qui porte un point reste lisible et saisissable. L'estompage se lisait
    //    comme « c'est fait », alors qu'un meme repere peut figurer deux fois sur un cliche :
    //    il fallait recliquer sur une entree qui se donnait pour epuisee.
    const etat = await p.$eval(`.radio-chip[data-rid="${rid}"]`,
      e => ({ opacite: parseFloat(getComputedStyle(e).opacity), texte: e.textContent }));
    if (!(etat.opacite > 0.95)) {
      ko('gestes : la legende est estompee (opacite ' + etat.opacite + ') des qu\'un point est pose — elle se donne pour epuisee');
    }
    if (etat.texte.indexOf('×1') < 0) ko('gestes : la legende ne compte pas le point pose (lu : ' + etat.texte + ')');

    // g) le repere reste choisi apres la depose : un deuxieme point se pose a la suite, sans
    //    retourner le chercher dans la legende.
    if (await p.$$eval('.radio-chip.sel', es => es.length) !== 1) {
      ko('gestes : le repere est relache apres la depose, il faut le rechercher dans la legende pour le poser une seconde fois');
    }
    await p.mouse.click(film.x + film.width * 0.4, film.y + film.height * 0.7);
    await p.waitForTimeout(60);
    if (await compte() !== 2) ko('gestes : le deuxieme point ne se pose pas a la suite du premier');
    const apres = await p.textContent(`.radio-chip[data-rid="${rid}"]`);
    if (apres.indexOf('×2') < 0) ko('gestes : le compteur de la legende reste a un point (lu : ' + apres + ')');

    // h) et on doit pouvoir le relacher : un nouveau toucher sur son entree, puis un clic sur
    //    le cliche, ne doit plus rien poser. Sans cette sortie, le repere resterait collé au
    //    pointeur et chaque clic ailleurs ajouterait un point involontaire.
    await p.click(`.radio-chip[data-rid="${rid}"]`);
    await p.waitForTimeout(60);
    if (await p.$$eval('.radio-chip.sel', es => es.length) !== 0) {
      ko('gestes : toucher a nouveau l\'entree de la legende ne relache pas le repere');
    }
    await p.mouse.click(film.x + film.width * 0.2, film.y + film.height * 0.2);
    await p.waitForTimeout(60);
    if (await compte() !== 2) ko('gestes : un clic sur le cliche pose encore un point alors qu\'aucun repere n\'est choisi');
    await p.close();
  }

  // ---- 5ter. Le cliche doit etre A L'ECRAN quand il s'ouvre ----
  // Il s'ouvrait EN BAS DE PAGE, devant la legende, sans la radiographie. Le defilement avait
  // lieu avant la fin du fondu de l'ecran d'introduction : celui-ci occupait encore sa place,
  // on visait donc une position que la page abandonnait aussitot, et tout remontait de trois
  // cents pixels. Mesure sur un ecran de TELEPHONE, ou le defaut se voit : sur un grand ecran
  // la page entiere tient parfois a l'image et le defaut passe inapercu.
  {
    const ctxT = await browser.newContext({ viewport: { width: 390, height: 780 } });
    ctxT.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
    await ctxT.addInitScript(() => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token:'t', refresh_token:'t', expires_at: Date.now() + 36e5,
        user_id:'test-user', email:'t@x.fr' }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id:'test-user', email:'t@x.fr', prenom:'T', nom:'A', annee:'TCEO1',
        faculte:'UFR Odontologie Dijon', approved:true }));
    });
    const p = await ctxT.newPage();
    await p.goto(URL);
    await p.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await p.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
    await p.waitForTimeout(900);
    await p.evaluate(() => window.EndoTeacherModes(true, true));
    await p.click('#hub-radio-btn');
    await p.waitForTimeout(400);
    await p.click('#start-radio-btn');
    await p.waitForTimeout(2200);   // fondu, chargement de l'image, puis defilement
    const vu = await p.evaluate(() => {
      const f = document.getElementById('radio-film').getBoundingClientRect();
      const dedans = Math.max(0, Math.min(f.bottom, window.innerHeight) - Math.max(f.top, 0));
      return { part: f.height ? dedans / f.height : 0, top: Math.round(f.top), h: Math.round(f.height) };
    });
    if (!vu.h) {
      ko('ouverture : le cliche n\'a aucune hauteur, la mesure ne prouverait rien');
    } else if (vu.part < 0.6) {
      ko('ouverture : seulement ' + Math.round(100 * vu.part) + ' % du cliche est a l\'ecran (haut a ' +
         vu.top + ') — l\'ecran ne s\'ouvre pas sur la radiographie');
    }
    await ctxT.close();
  }

  // ---- 5quater. Un cliche non valide par l'enseignante ne sort pas de son atelier ----
  // Quinze des vingt cliches portaient au moins un contour que j'avais moi-meme marque
  // « ebauche », et rien ne le disait a l'etudiant : il pouvait etre note faux parce que MA
  // zone etait fausse. Les vingt actuels sont relus et declares bons dans le code ; tout
  // cliche AJOUTE ENSUITE reste invisible tant qu'elle ne l'a pas publie depuis l'atelier.
  {
    const p = await context.newPage();
    await boot(p, 13);
    // Compte autorise a LIRE les cliches mais pas a les tracer — le cas d'Axel-William, et
    // celui ou la porte compte vraiment : il voit la liste de choix.
    await p.evaluate(() => {
      window.EndoAccount = Object.assign({}, window.EndoAccount, { isAdmin: false, accesRadio: true });
      window.EndoTeacherModes(true, false);
    });
    const cobaye = await p.evaluate(() => {
      if (!window.EndoRadioCas || !window.EndoRadioVisibles) return null;
      const c = window.EndoRadioCas[window.EndoRadioCas.length - 1];
      delete c.valide;                       // comme un cliche tout juste ajoute
      window.EndoRemplitChoix && window.EndoRemplitChoix();
      return c.id;
    });
    if (!cobaye) {
      ko('porte de validation : window.EndoRadioCas ou EndoRadioVisibles est introuvable, '
         + 'la porte n\'est eprouvee nulle part');
    } else {
      const visibles = await p.evaluate(() => window.EndoRadioVisibles());
      if (visibles.indexOf(cobaye) !== -1) {
        ko('porte de validation : un cliche non valide reste propose aux comptes non enseignants');
      }
      if (visibles.length !== attendus.length - 1) {
        ko('porte de validation : ' + visibles.length + ' cliches visibles au lieu de ' +
           (attendus.length - 1) + ' — la porte en retient plus ou moins qu\'il ne faut');
      }
      // Il ne doit pas non plus etre atteignable par la liste, ni par une demande forcee.
      await ouvreCliche(p);
      const options = await p.$$eval('#radio-choix option', os => os.map(o => o.value));
      if (options.indexOf(cobaye) !== -1) {
        ko('porte de validation : le cliche non valide figure encore dans la liste de choix');
      }
      const force = await p.evaluate((id) => {
        const sel = document.getElementById('radio-choix');
        const opt = document.createElement('option');
        opt.value = id; sel.appendChild(opt); sel.value = id;
        sel.dispatchEvent(new Event('change'));
        return true;
      }, cobaye);
      await p.waitForTimeout(500);
      const ouvert = await p.getAttribute('#radio-film img', 'src');
      const imageCobaye = await p.evaluate((id) =>
        (window.EndoRadioCas.find(c => c.id === id) || {}).image, cobaye);
      if (force && ouvert === imageCobaye) {
        ko('porte de validation : le cliche non valide s\'ouvre quand on force la liste');
      }
      // L'enseignante, elle, doit continuer a le voir : c'est dans l'atelier qu'elle valide.
      await p.evaluate(() => {
        window.EndoAccount = Object.assign({}, window.EndoAccount, { isAdmin: true });
        window.EndoTeacherModes(true, true);
      });
      const optionsEns = await p.$$eval('#radio-choix option', os => os.map(o => o.value));
      if (optionsEns.indexOf(cobaye) === -1) {
        ko('porte de validation : l\'enseignante ne voit plus le cliche qu\'elle doit justement valider');
      }
      // Controle du controle : la liste enseignante doit bien etre plus longue que l'autre.
      if (optionsEns.length <= options.length) {
        ko('AUTOCONTROLE : la liste enseignante n\'est pas plus longue que celle d\'un etudiant, '
           + 'les deux controles precedents ne prouveraient rien');
      }
    }
    await p.close();
  }

  // ---- 6bis. Trouve en trait plein, manque en pointilles ----
  // La correction promettait « la zone attendue (en pointillés) » alors que TOUTES les zones
  // etaient tracees en trait plein : la phrase renvoyait a un code qui n'existait pas. Le
  // dessin distingue desormais ce que l'etudiant a atteint de ce qui lui a echappe.
  {
    const p = await context.newPage();
    await boot(p, 5);
    await ouvreCliche(p);
    // Un cliche a plusieurs cibles, ouvert par la liste pour que le test ne depende pas du
    // tirage : on en atteint UNE seule, les autres doivent ressortir en pointilles.
    if (await p.$eval('#radio-choix-wrap', e => e.classList.contains('hidden'))) {
      ko('plein/pointilles : la liste enseignante est inatteignable, le cliche ne peut pas etre choisi');
    } else {
      await p.selectOption('#radio-choix', 'cone_argent_couronnes');
      await p.waitForTimeout(500);
      const zones = await zonesAttendues(p);   // revele les contours, puis on recommence
      await p.click('#radio-next-btn');
      await p.waitForTimeout(300);
      await p.selectOption('#radio-choix', 'cone_argent_couronnes');
      await p.waitForTimeout(500);

      const cible = zones[0];
      if (!cible || zones.length < 2) {
        ko('plein/pointilles : ce cliche n\'expose pas au moins deux zones, le test ne prouverait rien');
      } else {
        const cx = cible.poly.reduce((s, q) => s + q[0], 0) / cible.poly.length;
        const cy = cible.poly.reduce((s, q) => s + q[1], 0) / cible.poly.length;
        await p.click(`.radio-chip[data-rid="${cible.id}"]`);
        await p.waitForTimeout(80);
        const film = await p.$eval('#radio-film', e => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        const hU = await p.evaluate(() => {
          const r = document.getElementById('radio-film').getBoundingClientRect();
          return r.height / r.width * 360;
        });
        await p.mouse.click(film.x + film.w * (cx / 360), film.y + film.h * (cy / hU));
        await p.waitForTimeout(100);
        await p.click('#radio-submit-btn');
        await p.waitForTimeout(500);

        const dessin = await p.$$eval('#radio-overlay polygon[data-rid]', ns => ns.map(n => ({
          id: n.dataset.rid,
          trouvee: n.dataset.trouvee,
          tirets: n.getAttribute('stroke-dasharray')
        })));
        const atteinte = dessin.filter(z => z.id === cible.id);
        const autres   = dessin.filter(z => z.id !== cible.id);
        if (!atteinte.length) {
          ko('plein/pointilles : la zone visee n\'est pas dessinee a la correction');
        } else if (atteinte.some(z => z.trouvee !== '1' || z.tirets)) {
          ko('plein/pointilles : la zone ATTEINTE est tracee en pointilles — le code est inverse '
             + 'ou la zone n\'est pas reconnue comme trouvee');
        }
        if (!autres.length) {
          ko('plein/pointilles : aucune autre zone a comparer, le test ne prouverait rien');
        } else if (!autres.every(z => z.trouvee === '0' && z.tirets)) {
          ko('plein/pointilles : une zone MANQUEE reste en trait plein — l\'etudiant ne peut pas '
             + 'distinguer ce qu\'il a trouve de ce qui lui a echappe');
        }
        // La phrase qui annonce le code doit etre la : des pointillés que rien n'explique
        // sont une nuance qu'on remarque sans la comprendre.
        const cle = await p.$eval('.radio-cle', e => (e.textContent || '').trim()).catch(() => '');
        if (!/pointill/i.test(cle) || !/trait plein/i.test(cle)) {
          ko('plein/pointilles : la ligne qui explique le code est absente ou muette (lu : ' + cle + ')');
        }

        // LES PASTILLES NUMEROTEES. Elles donnent un second chemin entre une zone et son nom,
        // qui ne passe pas par la couleur : environ un homme sur douze confond certaines
        // teintes et ne peut pas faire ce lien-la. Sans elles, la correction n'est lisible
        // qu'a condition de distinguer huit couleurs.
        const nums = await p.$$eval('#radio-overlay text[data-num]', ns => ns.map(t => t.textContent.trim()));
        const attendusNum = await p.$$eval('#radio-overlay polygon[data-rid]',
          ns => new Set(ns.map(n => n.dataset.rid)).size);
        if (!nums.length) {
          ko('pastilles : aucune zone ne porte de numero a la correction — la correction ne se '
             + 'lit qu\'en distinguant les couleurs');
        } else {
          const uniques = [...new Set(nums)].map(Number).sort((a, b) => a - b);
          if (uniques.length !== attendusNum) {
            ko('pastilles : ' + uniques.length + ' numero(s) pour ' + attendusNum + ' zone(s)');
          }
          if (uniques.some((v, i) => v !== i + 1)) {
            ko('pastilles : la numerotation ne va pas de 1 a ' + attendusNum + ' (lue : ' + uniques.join(',') + ')');
          }
          // Et le MEME numero doit ouvrir la ligne correspondante : un numero sur le film qui
          // ne se retrouve pas dans la liste ne menerait nulle part.
          const lignes = await p.$$eval('#radio-verdicts .vlabel', ns => ns.map(t => t.textContent.trim()));
          const numerotees = lignes.filter(l => /^\d+\. /.test(l)).length;
          if (numerotees !== attendusNum) {
            ko('pastilles : ' + numerotees + ' ligne(s) de correction numerotee(s) pour ' +
               attendusNum + ' zone(s) — lues : ' + lignes.join(' / '));
          }
          // La RANGEE DE LEGENDES sous le cliche doit les porter aussi : c'est elle qu'on a
          // sous les yeux en remontant du film, et l'enseignante l'a signalee muette.
          const chips = await p.$$eval('.radio-chip .radio-chip-num', ns => ns.map(t => t.textContent.trim()));
          if (chips.length !== attendusNum) {
            ko('pastilles : ' + chips.length + ' entree(s) de legende numerotee(s) pour ' +
               attendusNum + ' zone(s) — la rangee sous le cliche ne relie rien aux numeros du film');
          }
          // Et le NUMERO DOIT PASSER AU-DESSUS des points poses par l'etudiant : un point
          // tombe au meme endroit masquait le numero, ce qui lui otait sa seule raison d'etre.
          const dessus = await p.evaluate(() => {
            const enf = [...document.getElementById('radio-overlay').children];
            const num = enf.findIndex(e => e.classList && e.classList.contains('radio-numeros'));
            const pts = enf.map((e, i) => e.classList && e.classList.contains('radio-pt') ? i : -1)
                           .filter(i => i >= 0);
            return { num, dernierPoint: pts.length ? Math.max(...pts) : -1, points: pts.length };
          });
          if (dessus.num < 0) {
            ko('pastilles : la couche des numeros est introuvable dans la correction');
          } else if (dessus.points && dessus.num < dessus.dernierPoint) {
            ko('pastilles : les numeros sont dessines SOUS les points de l\'etudiant — un point '
               + 'pose au meme endroit masque le numero');
          }
        }
      }
    }
    await p.close();
  }

  // ---- 7. Un refus du serveur doit se VOIR, et ne doit rien bloquer ----
  // L'enseignante a fait plusieurs lectures radio sans en voir trace dans le back-office. Si
  // le serveur refuse la ligne — contrainte qui n'accepte pas ce mode, colonne absente —, le
  // code se contentait de la remettre en file sans rien dire. Deux consequences : personne
  // n'apprenait que l'enregistrement avait echoue, et la ligne refusee repassait devant TOUT
  // ce qui suivait, bloquant aussi les resultats des deux autres modes. Trois choses a
  // prouver : le refus s'affiche, il ne bloque pas la file, et il se rejoue une fois reparé.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
    let refuseLesCas = true;
    const recus = { cas: 0, series: 0 };
    await ctx.route('**ujkpnlcbxzhwcftvxgcd.supabase.co/**', route => {
      const req = route.request(), url = req.url(), m = req.method();
      const json = (status, body) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(body)
      });
      if (url.includes('/rest/v1/case_results') && m === 'POST') {
        if (refuseLesCas) {
          return json(400, { message: 'new row for relation "case_results" violates check constraint "case_results_mode_check"' });
        }
        recus.cas += JSON.parse(req.postData() || '[]').length;
        return json(201, []);
      }
      if (url.includes('/rest/v1/results') && m === 'POST') {
        recus.series += JSON.parse(req.postData() || '[]').length;
        return json(201, []);
      }
      if (url.includes('/rest/v1/profiles') && m === 'GET') {
        return json(200, [{ id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
                            annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true, radio: true }]);
      }
      if (url.includes('/rest/v1/admins')) return json(200, []);
      return json(200, []);
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token: 'test', refresh_token: 'test',
        expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
      }));
    });

    const lit = (p, k) => p.evaluate(key => {
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    }, k);

    const p = await ctx.newPage();
    await p.goto(URL);
    await p.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await p.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
    await p.waitForTimeout(600);
    // Le compte porte le drapeau radio : pas besoin de forcer l'affichage, et c'est le
    // chemin reel d'un etudiant a qui l'enseignante a ouvert ce mode.
    if (await p.$eval('#hub-radio-btn', e => e.classList.contains('hidden'))) {
      ko('refus serveur : le drapeau radio du profil n\'ouvre pas le mode, la suite ne peut rien eprouver');
    } else {
      await p.click('#hub-radio-btn');
      await p.waitForTimeout(400);
      await p.click('#start-radio-btn');
      await p.waitForTimeout(700);
      await p.click('#radio-submit-btn');
      await p.waitForTimeout(900);

      const banniere = await p.evaluate(() => {
        const e = document.getElementById('envoi-ko');
        return e ? { cache: e.classList.contains('hidden'), texte: (e.textContent || '').trim() } : null;
      });
      if (!banniere) {
        ko('refus serveur : aucune ligne #envoi-ko dans la page, le refus ne peut pas se dire');
      } else if (banniere.cache) {
        ko('refus serveur : le refus reste muet, rien ne s\'affiche a l\'ecran');
      } else if (banniere.texte.indexOf('400') < 0) {
        ko('refus serveur : le message n\'annonce pas le code 400 (lu : ' + banniere.texte + ')');
      }

      const enFile = await lit(p, 'endodiag-pending') || [];
      const misDeCote = await lit(p, 'endodiag-refuses') || [];
      if (enFile.some(x => x && x.k === 'c')) {
        ko('refus serveur : la ligne refusee reste en file et repassera devant tous les resultats suivants');
      }
      if (!misDeCote.some(x => x && x.mode === 'radio')) {
        ko('refus serveur : la ligne refusee n\'est pas mise de cote, elle est perdue');
      }

      // Repare : la ligne mise de cote doit repartir d'elle-meme a la prochaine ouverture,
      // et la banniere s'effacer. Sans cela, le travail deja fait resterait invisible meme
      // une fois la base corrigee.
      refuseLesCas = false;
      await p.goto(URL);
      await p.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
      await p.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
      await p.waitForTimeout(1200);
      if (!recus.cas) ko('refus serveur : une fois le serveur reparé, la ligne mise de cote n\'est jamais renvoyee');
      const encore = await p.evaluate(() => {
        const e = document.getElementById('envoi-ko');
        return e ? !e.classList.contains('hidden') : false;
      });
      if (encore) ko('refus serveur : l\'avertissement reste affiche alors que l\'envoi est repasse');
    }
    await ctx.close();
  }

  // Un leurre quelque part, sinon la regle du « signe pose a tort » n'est eprouvee nulle part :
  // chaque cliche peut legitimement s'en passer, l'ensemble non.
  if (!clichesAvecLeurre) {
    ko('aucun cliche ne porte de leurre : la faute « signe pose a tort » n\'est plus eprouvee');
  }

  await browser.close();
  console.log('lecture-radio            Erreurs : ' + problemes.length + '  (' + vus.size + ' / ' + attendus.length + ' cliche(s) eprouve(s), ' + clichesAvecLeurre + ' avec leurre)');
  problemes.forEach(p => console.log('  - ' + p));
  process.exit(problemes.length ? 1 : 0);
})();

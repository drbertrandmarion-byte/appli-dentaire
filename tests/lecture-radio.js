// Lecture radiographique (troisieme mode, reserve a l'enseignante).
//
// Ce que la suite verifie, dans l'ordre :
//   1. Un etudiant ne voit pas le bouton — ni dans le menu, ni meme en cliquant dessus.
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
function pointExterieur(poly, distance, hU){
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
      if (dansPolygone(poly, x, y)) continue;
      if (dansPolygone(poly, mx + sens * nx * 1.5, my + sens * ny * 1.5)) continue;
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
      if (out.some(z => z.id === id)) return;
      // On lit l'attribut « points » REELLEMENT rendu, pas une declaration parallele : la
      // reference du test est ainsi la forme que l'etudiant voit a l'ecran.
      const poly = t.getAttribute('points').trim().split(/\s+/)
        .map(p => p.split(',').map(Number));
      out.push({ id, poly, W: film.width, H: film.height });
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
  }

  // ---- 1. Cote etudiant : le mode n'existe pas ----
  {
    const page = await context.newPage();
    await boot(page, 7);
    const etat = await page.evaluate(() => {
      const b = document.getElementById('hub-radio-btn');
      const r = b.getBoundingClientRect();
      return { cache: b.classList.contains('hidden'), aire: r.width * r.height };
    });
    if (!etat.cache) ko('le bouton « lecture radiographique » est visible pour un compte non enseignant');
    if (etat.aire !== 0) ko('le bouton enseignant occupe encore de la place a l\'ecran (aire ' + etat.aire + ')');
    // Et le panneau du mode ne doit pas s'ouvrir tout seul.
    const panneau = await page.evaluate(() => document.getElementById('mode-radio-intro').classList.contains('hidden'));
    if (!panneau) ko('le panneau du mode radio est affiche d\'emblee');
    await page.close();
  }

  // ---- 2. Le branchement de la porte enseignant, cote source ----
  // Un test en boite noire ne peut pas simuler un compte enseignant (Supabase est coupe) :
  // on verifie donc que l'appel reste bien dans enterApp et que le bouton part cache.
  {
    const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
    const enterApp = src.slice(src.indexOf('function enterApp(){'));
    const corps = enterApp.slice(0, enterApp.indexOf('\n  }'));
    if (!/EndoTeacherModes\(isAdmin\)/.test(corps)) {
      ko('enterApp n\'appelle plus EndoTeacherModes(isAdmin) : le bouton ne s\'afficherait jamais pour l\'enseignante');
    }
    if (!/<button class="hub-card hidden" id="hub-radio-btn"/.test(src)) {
      ko('le bouton #hub-radio-btn ne part plus cache dans le HTML : un etudiant le verrait le temps du chargement');
    }
  }

  // ---- 3. Le cliche lui-meme, cas par cas ----
  // Le nombre de cliches n'est pas fige : la suite parcourt des graines et eprouve chaque
  // cliche distinct qu'elle rencontre. Une graine qui ne rapporte rien de nouveau coute une
  // page ; en echange, ajouter une radiographie n'oblige pas a toucher au test.
  const vus = new Set();
  const GRAINES = 30;
  const SANS_NOUVEAU_MAX = 6; // arret quand six graines d'affilee ne rapportent plus rien
  let sansNouveau = 0;
  for (let graine = 1; graine <= GRAINES && sansNouveau < SANS_NOUVEAU_MAX; graine++) {
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
    if (vus.has(enonce)) { sansNouveau++; await a.close(); continue; }
    sansNouveau = 0;
    const zones = await zonesAttendues(a);
    const reperes = await tousLesReperes(a);
    const vide = await a.evaluate(() => ({
      classe: document.getElementById('radio-verdict').className,
      score: document.getElementById('radio-score').textContent.trim()
    }));
    await a.close();

    vus.add(enonce);
    const etiquette = 'cliche #' + vus.size;

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
    if (!leurres.length) ko(etiquette + ' : aucun leurre dans la legende, tous les reperes sont attendus');

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
    const sondes = zones.map(z => ({
      z,
      dedans: pointInterieur(z.poly),
      contact: pointExterieur(z.poly, 4, 360 * z.H / z.W),
      dehors: pointExterieur(z.poly, 34, 360 * z.H / z.W)
    }));
    sondes.forEach(s => {
      if (!s.dedans) ko(etiquette + ' : aucun point interieur trouve pour « ' + s.z.id + ' »');
      if (!s.contact || !s.dehors) ko(etiquette + ' : aucune sonde exterieure pour « ' + s.z.id + ' »');
    });
    if (sondes.some(s => !s.dedans || !s.contact || !s.dehors)) continue;

    // Passe B : tous les reperes attendus, franchement a l'interieur de leur contour.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      if (await p.getAttribute('#radio-film img', 'src') !== enonce) {
        ko(etiquette + ' : la graine ne rejoue pas le meme cliche (passe B)');
        await p.close(); continue;
      }
      for (const s of sondes) {
        const f = fraction(s.z, s.dedans.x, s.dedans.y);
        await depose(p, s.z.id, f.fx, f.fy);
      }
      const r = await valideEtLis(p);
      if (r.poses !== zones.length) ko(etiquette + ' : ' + r.poses + ' point(s) poses sur le cliche au lieu de ' + zones.length);
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
        const f = fraction(s.z, s.contact.x, s.contact.y);
        await depose(p, s.z.id, f.fx, f.fy);
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
        const f = fraction(s.z, s.dedans.x, s.dedans.y);
        await depose(p, s.z.id, f.fx, f.fy);
      }
      await depose(p, leurres[0], 0.5, 0.5);
      const r = await valideEtLis(p);
      if (!/\bko\b/.test(r.classe)) ko(etiquette + ' : une lecture fautive est comptee comme reussie');
      const attendu = (zones.length - 2) + ' / ' + zones.length
        + ' repères présents correctement identifiés — 1 repère mal situé, 1 repère oublié, 1 signe posé à tort.';
      if (r.score !== attendu) {
        ko(etiquette + ' : decompte des fautes = « ' + r.score + ' », attendu « ' + attendu + ' »');
      }
      // La zone mal situee doit etre signalee comme telle, et le leurre comme absent du cliche.
      const detail = await p.$$eval('#radio-verdicts li', es => es.map(e => e.textContent.trim()));
      if (!detail.some(t => /posé à côté de la zone attendue/.test(t))) ko(etiquette + ' : aucun « posé à côté » dans le detail');
      if (!detail.some(t => /n'est pas présent sur ce cliché/.test(t))) ko(etiquette + ' : le leurre n\'est pas signale dans le detail');
      if (!detail.some(t => /oublié/.test(t))) ko(etiquette + ' : l\'oubli n\'est pas signale dans le detail');
      await p.close();
    }
  }

  if (!vus.size) ko('aucun cliche n\'a pu etre ouvert en ' + GRAINES + ' graines');

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
    await p.close();
  }

  await browser.close();
  console.log('lecture-radio            Erreurs : ' + problemes.length + '  (' + vus.size + ' cliche(s) eprouve(s))');
  problemes.forEach(p => console.log('  - ' + p));
  process.exit(problemes.length ? 1 : 0);
})();

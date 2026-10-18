// Lecture radiographique (troisieme mode, reserve a l'enseignante).
//
// Ce que la suite verifie, dans l'ordre :
//   1. Un etudiant ne voit pas le bouton — ni dans le menu, ni meme en cliquant dessus.
//   2. Le cliche accepte un point depose au centre exact de la zone attendue.
//   3. La marge de tolerance existe vraiment : un point pose juste a l'interieur du rayon
//      passe, le meme pose juste au-dela est refuse. Sans ces deux mesures symetriques,
//      une tolerance devenue enorme — ou nulle — passerait inapercue.
//   4. Les trois fautes possibles sont comptees separement : repere mal situe, repere
//      oublie, signe pose a tort (leurre).
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

// Les zones attendues ne sont lisibles que dans la correction : on valide donc une lecture
// vide, et on releve les cercles en pointilles. La couleur fait le lien avec le repere,
// puisque c'est elle, et elle seule, que l'etudiant voit.
async function zonesAttendues(page){
  await page.click('#radio-submit-btn');
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const film = document.getElementById('radio-film').getBoundingClientRect();
    const parId = {};
    document.querySelectorAll('.radio-chip').forEach(c => {
      const dot = c.querySelector('.dot');
      parId[getComputedStyle(dot).backgroundColor] = c.getAttribute('data-rid');
    });
    const out = [];
    document.querySelectorAll('.radio-target').forEach(t => {
      const r = t.getBoundingClientRect();
      const id = parId[getComputedStyle(t).borderColor] || null;
      if (out.some(z => z.id === id)) return; // un repere peut avoir plusieurs zones : la premiere suffit
      out.push({
        id,
        fx: (r.left + r.width / 2 - film.left) / film.width,
        fy: (r.top + r.height / 2 - film.top) / film.height,
        rpx: r.width / 2
      });
    });
    return out;
  });
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
  const vus = new Set();
  let graine = 1;
  while (vus.size < 4 && graine <= 60) {
    const seed = graine++;

    // Passe A : lecture vide, pour relever les zones attendues de ce cliche.
    const a = await context.newPage();
    await boot(a, seed);
    await ouvreCliche(a);
    const enonce = (await a.textContent('#radio-def')).trim();
    if (vus.has(enonce)) { await a.close(); continue; }
    const zones = await zonesAttendues(a);
    const largeurFilm = await a.evaluate(() => document.getElementById('radio-film').getBoundingClientRect().width);
    const reperes = await tousLesReperes(a);
    const vide = await a.evaluate(() => ({
      classe: document.getElementById('radio-verdict').className,
      score: document.getElementById('radio-score').textContent.trim()
    }));
    await a.close();

    vus.add(enonce);
    const etiquette = 'cliche #' + vus.size;

    if (!zones.length) { ko(etiquette + ' : aucune zone attendue revelee par la correction'); continue; }
    if (zones.some(z => !z.id)) { ko(etiquette + ' : une zone attendue n\'a pas de repere identifiable (couleur inconnue)'); continue; }
    if (!/\bko\b/.test(vide.classe)) ko(etiquette + ' : une lecture entierement vide est comptee comme reussie');
    if (!new RegExp('^0 / ' + zones.length + ' ').test(vide.score)) {
      ko(etiquette + ' : score d\'une lecture vide = « ' + vide.score + ' », attendu « 0 / ' + zones.length + ' … »');
    }

    const leurres = reperes.filter(r => !zones.some(z => z.id === r));
    if (!leurres.length) ko(etiquette + ' : aucun leurre dans la legende, tous les reperes sont attendus');

    // Mesure ABSOLUE de la marge, en unites du viewBox (360 de large). Les deux passes
    // suivantes comparent la tolerance a elle-meme : si elle etait multipliee par dix ou
    // ramenee a zero, elles pourraient le rater puisque la sonde suit le rayon mesure.
    // Ici le rayon est juge pour ce qu'il est : au-dessus de 40, un point pose n'importe ou
    // sur la couronne serait accepte ; en dessous de 8, il faudrait viser au pixel.
    zones.forEach(z => {
      const rvb = z.rpx / largeurFilm * 360;
      if (rvb < 8 || rvb > 40) {
        ko(etiquette + ' : marge de tolerance de ' + rvb.toFixed(1) + ' unites pour « ' + z.id
           + ' » (attendu entre 8 et 40)');
      }
    });

    // Passe B : tous les reperes attendus, au centre exact de leur zone.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      if ((await p.textContent('#radio-def')).trim() !== enonce) {
        ko(etiquette + ' : la graine ne rejoue pas le meme cliche (passe B)');
        await p.close(); continue;
      }
      for (const z of zones) await depose(p, z.id, z.fx, z.fy);
      const r = await valideEtLis(p);
      if (r.poses !== zones.length) ko(etiquette + ' : ' + r.poses + ' point(s) poses sur le cliche au lieu de ' + zones.length);
      if (!/\bok\b/.test(r.classe)) ko(etiquette + ' : lecture parfaite refusee — « ' + r.score + ' »');
      if (r.score !== zones.length + ' / ' + zones.length + ' repères présents correctement identifiés.') {
        ko(etiquette + ' : score d\'une lecture parfaite = « ' + r.score + ' »');
      }
      await p.close();
    }

    // Passe C : juste a l'interieur de la marge. Chaque point est decale de (rayon - 3) px,
    // en diagonale pour eviter de retomber par hasard sur une autre zone du meme repere.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      for (const z of zones) {
        const d = Math.max(0, z.rpx - 3) / Math.SQRT2;
        await depose(p, z.id, z.fx, z.fy, d, -d);
      }
      const r = await valideEtLis(p);
      if (!/\bok\b/.test(r.classe)) {
        ko(etiquette + ' : un point pose a l\'interieur de la marge est refuse — « ' + r.score + ' » (la tolerance ne fonctionne pas)');
      }
      await p.close();
    }

    // Passe D : les trois fautes, une de chaque, et la limite exterieure de la marge.
    {
      const p = await context.newPage();
      await boot(p, seed);
      await ouvreCliche(p);
      const malSitue = zones[0];
      const oublie = zones[zones.length - 1];
      const d = (malSitue.rpx + 8) / Math.SQRT2;
      await depose(p, malSitue.id, malSitue.fx, malSitue.fy, d, d);
      for (const z of zones.slice(1, zones.length - 1)) await depose(p, z.id, z.fx, z.fy);
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

  if (vus.size < 4) ko('seuls ' + vus.size + ' cliches sur 4 ont ete tires en 60 graines');

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
  console.log('lecture-radio            Erreurs : ' + problemes.length);
  problemes.forEach(p => console.log('  - ' + p));
  process.exit(problemes.length ? 1 : 0);
})();

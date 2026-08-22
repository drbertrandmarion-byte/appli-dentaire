// Confettis du sans-faute : ils doivent tomber sur un 5/5 ou un 10/10, et jamais autrement.
//
// Le test joue de vraies séries jusqu'au bout plutôt que d'appeler la fonction d'animation à la
// main : ce qui peut casser, ce n'est pas le tracé, c'est la condition qui le déclenche.
//
// Pour obtenir un sans-faute il faut connaître le corrigé de cas tirés au hasard. Plutôt que d'en
// recopier une table — qui se périmerait à la première modification de l'application —, le test
// remplace Math.random par un générateur déterministe, puis joue chaque série DEUX FOIS : au
// premier passage il répond n'importe quoi et lit les bonnes réponses dans la correction, au
// second il rejoue la même série — identique, puisque le tirage l'est — en répondant juste.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = 'http://localhost:9300/index.html';

// Générateur congruentiel linéaire : deux passages avec la même graine tirent exactement la même
// suite de cas. Installé avant les scripts de la page, donc avant le moindre tirage.
const GRAINE = (graine) => {
  let s = graine >>> 0;
  Math.random = function(){
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 1) / 0x80000000;
  };
};

async function ouvrir(browser, graine, reduitMouvement){
  const page = await browser.newPage({
    viewport: { width: 900, height: 900 },
    reducedMotion: reduitMouvement ? 'reduce' : 'no-preference'
  });
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.addInitScript(GRAINE, graine);
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u', email:'e@e.fr' }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id:'u', email:'e@e.fr', prenom:'T', nom:'A', annee:'TCEO1',
      faculte:'UFR Odontologie Dijon', approved:true }));
    // Le repli hors ligne exige un passage en ligne de moins de 24 h : sans cette date, il
    // refuserait d'ouvrir l'application et aucune suite ne pourrait plus rien tester.
    localStorage.setItem('endodiag-last-online', JSON.stringify(Date.now()));

  });
  await page.goto(URL);
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
  return page;
}

// ---------------------------------------------------------------------------
//  Mode Diagnostic
// ---------------------------------------------------------------------------

// Joue une série entière. `corrige` absent => on répond au hasard et on renvoie les bonnes
// réponses lues dans le récapitulatif ; `corrige` fourni => on répond juste.
async function jouerSerieDiagnostic(page, longueur, corrige){
  await page.click('#hub-diagnostic-btn');
  await page.click(longueur === 10 ? '#start-quiz10-btn' : '#start-quiz-btn');
  await page.waitForTimeout(450);

  for (let i = 0; i < longueur; i++){
    if (corrige){
      await page.selectOption('#diagnosis-select', { label: corrige[i] });
    } else {
      // Une réponse arbitraire mais stable : la première du menu.
      const valeurs = await page.$$eval('#diagnosis-select option', os =>
        os.map(o => o.value).filter(v => v));
      await page.selectOption('#diagnosis-select', valeurs[0]);
    }
    await page.click('#guess-btn');
    await page.waitForTimeout(250);
    await page.click('#next-action-btn');
    await page.waitForTimeout(450);
  }

  // « Cas 3 : Nécrose pulpaire » -> « Nécrose pulpaire »
  const reels = await page.$$eval('#score-recap .score-row .real', ns =>
    ns.map(n => n.textContent.replace(/^Cas\s+\d+\s*:\s*/, '').trim()));
  const score = await page.$eval('#score-number', n => n.textContent.trim());
  return { reels, score };
}

// ---------------------------------------------------------------------------
//  Mode Choix thérapeutique
// ---------------------------------------------------------------------------

// Coche exactement `voulus` (libellés) dans le groupe `groupe`, en décochant le reste.
const COCHER = ([groupe, voulus]) => {
  const cases = Array.prototype.slice.call(
    document.querySelectorAll('input[data-group="' + groupe + '"]'));
  cases.forEach(function(c){
    const texte = c.parentNode.textContent.trim();
    c.checked = voulus.indexOf(texte) !== -1;
  });
  return cases.length;
};

// Lit la correction affichée et reconstitue, par groupe, l'ensemble attendu : tout ce qui est
// marqué « ✓ » (juste) ou « ＋ oublié » l'était ; ce qui est « ✗ en trop » ne l'était pas.
const LIRE_CORRECTION = () => {
  const parGroupe = {};
  const cle = {
    'Geste coronaire': 'coronaire',
    'Geste chirurgical': 'chirurgical',
    'Geste médicamenteux (urgence)': 'medicamenteux',
    'Geste sur la dent': 'geste',
    'Restauration coronaire définitive': 'coronaire_final',
    'Geste médicamenteux (traitement final)': 'medicamenteux'
  };
  Array.prototype.slice.call(document.querySelectorAll('#tx-result-recap .score-row'))
    .forEach(function(row){
      const titre = row.querySelector('.real').textContent.trim();
      const etape = (titre === 'Geste sur la dent' || titre === 'Restauration coronaire définitive'
                     || titre.indexOf('traitement final') !== -1) ? 'final' : 'urgence';
      const g = cle[titre];
      if (!g) return;
      const attendus = [];
      Array.prototype.slice.call(row.querySelectorAll('li.tx-check-item')).forEach(function(li){
        if (li.classList.contains('tx-check-extra')) return;      // coché à tort
        if (li.textContent.indexOf('Rien à cocher ici') !== -1) return;
        attendus.push(li.textContent.replace(/^[✓✗＋]\s*(en trop :|oublié :)?\s*/, '').trim());
      });
      parGroupe[etape + '.' + g] = attendus;
    });
  return parGroupe;
};

async function jouerSerieTx(page, longueur, corriges){
  await page.click('#hub-tx-btn');
  await page.click(longueur === 10 ? '#start-tx-quiz10-btn' : '#start-tx-quiz-btn');
  await page.waitForTimeout(450);

  const appris = [];
  for (let i = 0; i < longueur; i++){
    const c = corriges ? corriges[i] : null;
    // Un cas comporte une étape « urgence » et, seulement pour certains, une étape « traitement
    // final ». On s'arrête sur l'affichage réel de la fiche de correction plutôt que sur la
    // présence du bouton, qui reste dans le DOM une fois la carte masquée.
    for (let etapeIdx = 0; etapeIdx < 2; etapeIdx++){
      const enCours = await page.evaluate(() =>
        getComputedStyle(document.getElementById('tx-case-card')).display !== 'none');
      if (!enCours) break;
      const etape = etapeIdx === 0 ? 'urgence' : 'final';
      for (const g of ['coronaire', 'chirurgical', 'medicamenteux', 'geste', 'coronaire_final']){
        const voulus = c ? (c[etape + '.' + g] || []) : [];
        await page.evaluate(COCHER, [g, voulus]);
      }
      if (!c){
        // Sans corrigé, il faut tout de même satisfaire la validation : elle refuse une étape
        // d'urgence dont le geste coronaire OU le geste chirurgical est vide, et une étape finale
        // sans geste. Le premier item de chaque groupe suffit.
        await page.evaluate(() => {
          ['coronaire', 'chirurgical', 'geste', 'coronaire_final'].forEach(function(g){
            const c = document.querySelector('input[data-group="' + g + '"]');
            if (c) c.checked = true;
          });
        });
      }
      await page.click('#tx-step-submit-btn');
      await page.waitForTimeout(450);
    }
    if (!c) appris.push(await page.evaluate(LIRE_CORRECTION));
    await page.click('#tx-next-btn');
    await page.waitForTimeout(450);
  }

  const score = await page.$eval('#tx-score-number', n => n.textContent.trim());
  return { appris, score };
}

// ---------------------------------------------------------------------------
//  Sonde de la couche de confettis
// ---------------------------------------------------------------------------

// Renvoie l'état réel de la couche : présence, style calculé, et centre de gravité des pixels
// dessinés — c'est lui qui permet de vérifier que les confettis TOMBENT, et pas seulement
// qu'un canvas existe.
const SONDE = () => {
  const c = document.getElementById('confetti-layer');
  if (!c) return { present: false };
  const st = getComputedStyle(c);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sommeY = 0;
  const couleurs = new Set();
  const PAS = 2;   // un pixel sur deux dans chaque axe : assez fin pour que le compte soit stable
  for (let y = 0; y < c.height; y += PAS){
    for (let x = 0; x < c.width; x += PAS){
      const i = (y * c.width + x) * 4;
      if (d[i + 3] > 40){
        n++; sommeY += y;
        couleurs.add((d[i] >> 4) + ',' + (d[i+1] >> 4) + ',' + (d[i+2] >> 4));
      }
    }
  }
  return {
    present: true,
    position: st.position,
    pointerEvents: st.pointerEvents,
    zIndex: st.zIndex,
    ariaHidden: c.getAttribute('aria-hidden'),
    couvreEcran: Math.abs(c.getBoundingClientRect().width - window.innerWidth) < 2 &&
                 Math.abs(c.getBoundingClientRect().height - window.innerHeight) < 2,
    pixels: n,
    centreY: n ? sommeY / n : null,
    nuances: couleurs.size
  };
};

// ---------------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const dire = (t) => console.log(t);
  const exiger = (condition, message) => { if (!condition) erreurs.push(message); };

  // ===== 1. Série de 5 en Diagnostic : apprentissage puis sans-faute =====
  let page = await ouvrir(browser, 20260822, false);
  const a5 = await jouerSerieDiagnostic(page, 5, null);
  const sondeImparfait = await page.evaluate(SONDE);
  dire(`Diagnostic 5 — passage d'apprentissage : ${a5.score}`);
  if (a5.score !== '5 / 5'){
    exiger(!sondeImparfait.present, `score imparfait (${a5.score}) mais des confettis tombent`);
    dire('  aucun confetti sur un score imparfait — correct');
  }
  await page.close();

  page = await ouvrir(browser, 20260822, false);
  const b5 = await jouerSerieDiagnostic(page, 5, a5.reels);
  dire(`Diagnostic 5 — passage corrigé      : ${b5.score}`);
  exiger(b5.score === '5 / 5', `le rejeu corrigé donne ${b5.score} au lieu de 5 / 5 — le test ne prouve rien`);

  const t1 = await page.evaluate(SONDE);
  exiger(t1.present, 'aucun canvas de confettis sur un 5/5');
  if (t1.present){
    exiger(t1.position === 'fixed', `couche en position ${t1.position} au lieu de fixed`);
    exiger(t1.pointerEvents === 'none', `couche en pointer-events ${t1.pointerEvents} : elle avalerait les clics`);
    exiger(t1.ariaHidden === 'true', 'couche décorative non masquée aux lecteurs d’écran (aria-hidden)');
    exiger(t1.couvreEcran, 'la couche ne couvre pas tout l’écran');
    exiger(t1.pixels > 0, 'canvas présent mais vide');
    dire(`  couche : ${t1.pixels} pixels dessinés, z-index ${t1.zIndex}`);
  }

  // Ils doivent tomber, et la pluie doit s'installer : au premier instant seules les premières
  // pièces sont entrées dans l'écran — c'est une seconde plus tard qu'on voit si elles arrivent
  // vraiment toutes, ou si le gros du lot est resté bloqué au-dessus du cadre.
  await page.waitForTimeout(900);
  const t2 = await page.evaluate(SONDE);
  exiger(t2.present, 'la couche a disparu au bout d’une seconde');
  if (t1.present && t2.present){
    exiger(t2.centreY > t1.centreY + 5,
      `les confettis ne descendent pas (centre ${Math.round(t1.centreY)} -> ${Math.round(t2.centreY)})`);
    exiger(t2.pixels > t1.pixels,
      `la pluie ne s’étoffe pas (${t1.pixels} -> ${t2.pixels} pixels échantillonnés)`);
    exiger(t2.pixels >= 150,
      `seulement ${t2.pixels} pixels échantillonnés en pleine chute : trop peu de confettis à l’écran`);
    exiger(t2.nuances >= 4, `confettis en ${t2.nuances} nuance(s) : la variété de couleurs a disparu`);
    dire(`  chute : centre de gravité ${Math.round(t1.centreY)} -> ${Math.round(t2.centreY)} px, ` +
         `${t1.pixels} -> ${t2.pixels} pixels échantillonnés, ${t2.nuances} nuances`);
  }

  // Le bouton « Recommencer » doit rester cliquable pendant l'animation.
  const auDessusDuBouton = await page.evaluate(() => {
    const b = document.getElementById('quiz-restart-btn');
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el ? (el.id || el.tagName) : null;
  });
  exiger(auDessusDuBouton === 'quiz-restart-btn',
    `pendant l’animation, le clic sur « Recommencer » atterrit sur ${auDessusDuBouton}`);
  dire(`  au centre du bouton « Recommencer » : ${auDessusDuBouton}`);

  // Quitter l'écran de score arrête les confettis immédiatement.
  await page.click('#quiz-restart-btn');
  await page.waitForTimeout(120);
  const apresRetour = await page.evaluate(SONDE);
  exiger(!apresRetour.present, 'les confettis continuent après avoir quitté l’écran de score');
  dire(`  après « Recommencer » : couche ${apresRetour.present ? 'toujours là' : 'retirée'}`);
  await page.close();

  // ===== 2. L'animation se termine et se nettoie =====
  page = await ouvrir(browser, 20260822, false);
  await page.evaluate(() => window.EndoConfetti.lancer(10));
  await page.waitForTimeout(150);
  const dense = await page.evaluate(SONDE);
  exiger(dense.present && dense.pixels > 0, 'lancer(10) ne dessine rien');
  await page.waitForTimeout(6000);
  const fini = await page.evaluate(SONDE);
  exiger(!fini.present, 'la couche de confettis subsiste après la fin de l’animation');
  dire(`\nNettoyage : couche ${fini.present ? 'NON retirée' : 'retirée'} après 6 s`);
  await page.close();

  // ===== 3. Mouvement réduit : rien ne doit tomber =====
  page = await ouvrir(browser, 20260822, true);
  await page.evaluate(() => window.EndoConfetti.lancer(10));
  await page.waitForTimeout(200);
  const reduit = await page.evaluate(SONDE);
  exiger(!reduit.present, 'les confettis s’affichent malgré « prefers-reduced-motion: reduce »');
  dire(`Mouvement réduit : couche ${reduit.present ? 'affichée (à corriger)' : 'supprimée'}`);
  await page.close();

  // ===== 4. Série de 10 en Choix thérapeutique : sans-faute =====
  page = await ouvrir(browser, 7, false);
  const aTx = await jouerSerieTx(page, 10, null);
  dire(`\nThérapeutique 10 — passage d'apprentissage : ${aTx.score}`);
  await page.close();

  page = await ouvrir(browser, 7, false);
  const bTx = await jouerSerieTx(page, 10, aTx.appris);
  dire(`Thérapeutique 10 — passage corrigé      : ${bTx.score}`);
  exiger(bTx.score === '10 / 10', `le rejeu corrigé donne ${bTx.score} au lieu de 10 / 10 — le test ne prouve rien`);
  await page.waitForTimeout(900);
  const tTx = await page.evaluate(SONDE);
  exiger(tTx.present, 'aucun confetti sur un 10/10 en mode thérapeutique');
  if (tTx.present){
    exiger(tTx.pixels >= 150, `seulement ${tTx.pixels} pixels échantillonnés sur un 10/10`);
    dire(`  couche : ${tTx.pixels} pixels dessinés, ${tTx.nuances} nuances`);
  }
  await page.close();

  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

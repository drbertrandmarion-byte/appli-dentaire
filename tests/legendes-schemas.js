// Légendes des schémas : aucune entrée superflue, aucune manquante, aucune pastille dont la
// couleur ne corresponde pas au tracé. Le contrôle se fait sur le SVG réellement produit, et
// les cas s'enchaînent SANS rechargement de page — c'est ainsi qu'une légende oubliée d'un cas
// à l'autre se révèle, alors qu'un rechargement la masquerait.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// Le préfixe est passé explicitement : les deux schémas coexistent dans le DOM, l'un masqué,
// et se fier à leur simple présence ferait toujours sonder le même.
const SONDE = (prefixe) => {
  const svg = document.getElementById(prefixe ? 'tx-diagram' : 'result-diagram');
  const h = svg.innerHTML;
  // On interroge le rendu réel, jamais la présence de la classe : c'est justement une classe
  // « hidden » sans effet — neutralisée par une règle plus spécifique — que ce test doit attraper.
  const vis = id => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== 'none';
  };
  const fond = id => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  const rgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  // Ce que le tracé contient réellement
  const traceSoin     = /#c7cdd6/i.test(h);
  const traceCouronne = /#eef3f7/i.test(h);
  const traceFracture = h.indexOf('M118,102 L118,90') !== -1;
  // Signature du schéma à deux racines : le second canal radiculaire, propre à ce tracé.
  const dualRoot      = h.indexOf('M151,96 L159,96') !== -1;
  // Couleur de pulpe employée dans le tracé : premier remplissage de la forme canalaire
  const mPulpe = h.match(/<path d="M144,96 L156,96[^"]*" fill="(#[0-9a-f]{6})"/i)
              || h.match(/<path d="M141,96 L149,96[^"]*" fill="(#[0-9a-f]{6})"/i);
  return {
    titre: document.getElementById(prefixe ? 'tx-title' : 'result-title').textContent.trim(),
    legendeSoin: vis(prefixe + 'restoration-legend-item')
      ? document.getElementById(prefixe + 'restoration-legend-label').textContent.trim() : null,
    pastilleSoin: fond(prefixe + 'sw-restoration'),
    legendePulpe2: vis(prefixe + 'pulp-legend-item-2'),
    pastillePulpe: fond(prefixe + 'sw-pulp'),
    pulpeTracee: mPulpe ? rgb(mPulpe[1]) : null,
    traceSoin, traceCouronne, traceFracture, dualRoot
  };
};

async function auditer(page, r, mode, erreurs) {
  const dessine = r.traceSoin || r.traceCouronne || r.traceFracture;
  const etiquette = r.legendeSoin;

  if (!!etiquette !== dessine) {
    erreurs.push(`[${mode}] ${r.titre} : légende « ${etiquette || 'aucune'} » mais tracé ${dessine ? 'présent' : 'absent'}`);
  }
  if (etiquette === 'Couronne céramique sur inlay-core' && !r.traceCouronne)
    erreurs.push(`[${mode}] ${r.titre} : légende couronne sans couronne tracée`);
  if (etiquette === 'Couronne fracturée au ras de la gencive' && !r.traceFracture)
    erreurs.push(`[${mode}] ${r.titre} : légende fracture sans moignon tracé`);
  if ((etiquette === 'Soin infiltré (liseré noir)' || etiquette === 'Soin récent') && !r.traceSoin)
    erreurs.push(`[${mode}] ${r.titre} : légende soin sans soin tracé`);

  // La pastille de pulpe doit reprendre exactement la couleur du canal dessiné.
  if (r.pulpeTracee && r.pastillePulpe && r.pulpeTracee !== r.pastillePulpe) {
    erreurs.push(`[${mode}] ${r.titre} : pastille pulpe ${r.pastillePulpe} ≠ tracé ${r.pulpeTracee}`);
  }
  // Seconde pulpe : réservée aux schémas à deux racines.
  if (r.legendePulpe2 && !r.dualRoot) {
    erreurs.push(`[${mode}] ${r.titre} : seconde légende de pulpe sur un schéma à racine unique`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:900, height:1100 } });
  await page.route('**://*.supabase.co/**', r => r.abort());
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

  const erreurs = [];

  // ---- Mode « Choix thérapeutique » : 60 cas enchaînés sans rechargement ----
  await page.goto('http://localhost:9300/index.html');
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
  await page.click('#hub-tx-btn');
  await page.click('#start-tx-btn');
  await page.waitForTimeout(450);

  const vusTx = new Set();
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(SONDE, 'tx-');
    vusTx.add(r.titre);
    await auditer(page, r, 'thérapeutique', erreurs);
    await page.evaluate(() => { const b = document.getElementById('start-tx-btn'); if (b) b.click(); });
    await page.waitForTimeout(450);
  }
  console.log(`Mode thérapeutique : ${vusTx.size} pathologies vues sur 60 tirages enchaînés`);

  // ---- Mode « Diagnostic » : la fiche de correction porte le même schéma ----
  const vusDg = new Set();
  for (let i = 0; i < 30; i++) {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
    await page.click('#hub-diagnostic-btn');
    await page.click('#start-single-btn');
    await page.waitForTimeout(70);
    await page.selectOption('#question-select', 'radio');
    await page.click('#ask-btn');
    await page.waitForTimeout(50);
    await page.selectOption('#diagnosis-select', 'necrose');
    await page.click('#guess-btn');
    await page.waitForTimeout(120);
    const r = await page.evaluate(SONDE, '');
    vusDg.add(r.titre);
    await auditer(page, r, 'diagnostic', erreurs);
  }
  console.log(`Mode diagnostic     : ${vusDg.size} pathologies vues sur 30 tirages`);

  console.log(`\nErreurs : ${erreurs.length}`);
  [...new Set(erreurs)].forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

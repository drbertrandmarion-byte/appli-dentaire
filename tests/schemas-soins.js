// Cohérence entre l'énoncé radiographique et le schéma, en mode « Choix thérapeutique ».
// Deux exigences :
//   - une dent déjà traitée porte toujours une obturation coronaire dessinée (une dent dépulpée
//     en a forcément une, et c'est sa perte d'étanchéité qui explique la réinfection) ;
//   - un soin n'est dessiné que si l'énoncé le mentionne, et du bon type.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:900, height:1000 } });
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u', email:'e@e.fr' }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id:'u', email:'e@e.fr', prenom:'T', nom:'A', annee:'TCEO1',
      faculte:'UFR Odontologie Dijon', approved:true }));
  });

  const vus = new Map();
  const erreurs = [];

  // On boucle jusqu'à avoir vu les DOUZE pathologies, et l'on échoue si l'une manque : s'arrêter
  // à un nombre d'énoncés donne une fausse assurance — un cas jamais tiré n'est pas un cas vérifié.
  const PATHOS = new Set();
  for (let i = 0; i < 600 && (PATHOS.size < 12 || vus.size < 24); i++) {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
    await page.click('#hub-tx-btn');
    await page.click('#start-tx-btn');
    await page.waitForTimeout(70);

    const r = await page.evaluate(() => ({
      titre: document.getElementById('tx-title').textContent.trim(),
      def:   document.getElementById('tx-def').textContent.trim(),
      radio: document.getElementById('tx-radio-text').textContent.trim(),
      pulpe: document.getElementById('tx-pulp-legend-label').textContent.trim(),
      soin:  getComputedStyle(document.getElementById('tx-restoration-legend-item')).display === 'none'
             ? null : document.getElementById('tx-restoration-legend-label').textContent.trim(),
      dessine: /#c7cdd6/i.test(document.getElementById('tx-diagram').innerHTML)
    }));

    PATHOS.add(r.titre);
    const cle = r.radio.slice(0, 90);
    if (vus.has(cle)) continue;
    vus.set(cle, r);

    const traitee = r.pulpe.indexOf('Obturation canalaire') !== -1;
    const nom = (r.def.split(',')[0] || '?').trim();
    const radio = r.radio.toLowerCase();

    // Ce que l'énoncé décrit -> ce que la légende doit annoncer. Une lésion carieuse ne produit
    // aucune entrée de légende : elle est dessinée comme une carie, pas comme un soin.
    let attendu;
    if (radio.includes('couronne céramique scellée sur inlay-core')) attendu = 'Couronne céramique sur inlay-core';
    else if (radio.includes('fracture coronaire juxta-gingivale'))   attendu = 'Couronne fracturée au ras de la gencive';
    else if (radio.includes('étanchéité'))                            attendu = 'Soin infiltré (liseré noir)';
    else if (radio.includes('restauration récente'))                  attendu = 'Soin récent';
    else if (radio.includes('lésion carieuse'))                       attendu = null;
    else                                                              attendu = null;

    if (r.soin !== attendu) {
      erreurs.push(`${nom} : énoncé -> « ${attendu || 'aucun soin'} », mais légende « ${r.soin || 'aucune'} »`);
    }

    // Une dent déjà traitée doit toujours montrer un état coronaire explicite : obturation,
    // couronne prothétique, couronne fracturée ou lésion carieuse. Jamais une couronne intacte.
    if (traitee) {
      const decrit = radio.includes('étanchéité') || radio.includes('inlay-core')
                  || radio.includes('fracture coronaire') || radio.includes('lésion carieuse')
                  || radio.includes('fracture radiculaire');
      if (!decrit) erreurs.push(`${nom} : dent déjà traitée sans état coronaire décrit`);
    }

    // Une dent saine ne doit annoncer aucun délabrement : l'énoncé, le schéma et la boîte
    // « Radiographie » doivent dire la même chose.
    const nieDelabrement = /aucun délabrement/i.test(r.radio);
    if (r.pulpe.indexOf('saine') !== -1 && !nieDelabrement && /délabrement/i.test(r.radio)) {
      erreurs.push(`${nom} : dent saine mais radiographie annonçant un délabrement`);
    }

    // La légende ne doit jamais annoncer un soin que le tracé ne contient pas.
    if (attendu === 'Soin infiltré (liseré noir)' || attendu === 'Soin récent') {
      if (!r.dessine) erreurs.push(`${nom} : légende « ${attendu} » mais aucun soin tracé`);
    }
  }

  let traitees = 0, infiltres = 0, recents = 0, sans = 0;
  for (const r of vus.values()) {
    if (r.pulpe.indexOf('Obturation canalaire') !== -1) traitees++;
    if (r.soin === 'Soin infiltré (liseré noir)') infiltres++;
    else if (r.soin === 'Soin récent') recents++;
    else sans++;
  }
  console.log(`Pathologies rencontrées : ${PATHOS.size} / 12`);
  if (PATHOS.size < 12) erreurs.push(`couverture incomplète : ${12 - PATHOS.size} pathologie(s) jamais tirée(s)`);
  console.log(`Énoncés radiographiques distincts rencontrés : ${vus.size}`);
  console.log(`  dents déjà traitées : ${traitees}`);
  console.log(`  soin infiltré dessiné : ${infiltres}`);
  console.log(`  soin récent dessiné   : ${recents}`);
  console.log(`  aucun soin dessiné    : ${sans}`);
  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

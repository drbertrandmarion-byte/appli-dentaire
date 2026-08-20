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

  for (let i = 0; i < 320 && vus.size < 40; i++) {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
    await page.click('#hub-tx-btn');
    await page.click('#start-tx-btn');
    await page.waitForTimeout(70);

    const r = await page.evaluate(() => ({
      def:   document.getElementById('tx-def').textContent.trim(),
      radio: document.getElementById('tx-radio-text').textContent.trim(),
      pulpe: document.getElementById('tx-pulp-legend-label').textContent.trim(),
      soin:  document.getElementById('tx-restoration-legend-item').classList.contains('hidden')
             ? null : document.getElementById('tx-restoration-legend-label').textContent.trim(),
      dessine: /#c7cdd6/i.test(document.getElementById('tx-diagram').innerHTML)
    }));

    const cle = r.radio.slice(0, 90);
    if (vus.has(cle)) continue;
    vus.set(cle, r);

    const traitee   = r.pulpe.indexOf('Obturation canalaire') !== -1;
    const ditFuite  = /étanchéité/i.test(r.radio);
    const ditRecent = /restauration récente/i.test(r.radio);
    const nom = (r.def.split(',')[0] || '?').trim();

    // 1. Dent déjà traitée -> obturation coronaire toujours dessinée, et infiltrée.
    if (traitee && r.soin !== 'Soin infiltré (liseré noir)') {
      erreurs.push(`${nom} : dent déjà traitée mais soin coronaire = ${r.soin || 'aucun'}`);
    }
    // 2. Légende et dessin doivent aller ensemble.
    if (!!r.soin !== r.dessine) {
      erreurs.push(`${nom} : légende (${r.soin || 'aucune'}) et dessin (${r.dessine}) discordants`);
    }
    // 3. Le type dessiné doit correspondre à ce que dit l'énoncé.
    if (ditFuite  && r.soin !== 'Soin infiltré (liseré noir)') erreurs.push(`${nom} : énoncé « étanchéité » mais soin = ${r.soin || 'aucun'}`);
    if (ditRecent && r.soin !== 'Soin récent')                 erreurs.push(`${nom} : énoncé « récente » mais soin = ${r.soin || 'aucun'}`);
    // 4. Pas de soin dessiné si l'énoncé n'en parle pas — sauf dent déjà traitée.
    if (!traitee && !ditFuite && !ditRecent && r.soin) {
      erreurs.push(`${nom} : soin « ${r.soin} » dessiné alors que l'énoncé n'en mentionne aucun`);
    }
  }

  let traitees = 0, infiltres = 0, recents = 0, sans = 0;
  for (const r of vus.values()) {
    if (r.pulpe.indexOf('Obturation canalaire') !== -1) traitees++;
    if (r.soin === 'Soin infiltré (liseré noir)') infiltres++;
    else if (r.soin === 'Soin récent') recents++;
    else sans++;
  }
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

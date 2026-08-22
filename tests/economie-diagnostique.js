// Economie diagnostique : seuil de rappel a 7 questions, changement de ton de l'encadre,
// et calcul du rang a partir duquel les questions n'apportaient plus rien.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// Trois interrogatoires de longueurs differentes, pour couvrir les trois branches.
const SCENARIOS = [
  { nom: 'court (3 questions)',  qs: ['froid', 'percussion', 'radio'] },
  { nom: 'seuil (7 questions)',  qs: ['froid', 'percussion', 'radio', 'palpation', 'chaud', 'sucre', 'nocturne'] },
  { nom: 'peu cible (9 quest.)', qs: ['chaud', 'sucre', 'nocturne', 'pulsation', 'dent_longue',
                                      'mastication', 'godet', 'reflux', 'signes_generaux'] }
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
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

  for (const sc of SCENARIOS) {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
    await page.click('#hub-diagnostic-btn');
    await page.click('#start-single-btn');
    await page.waitForTimeout(80);

    const nudge = [];
    for (let i = 0; i < sc.qs.length; i++) {
      await page.selectOption('#question-select', sc.qs[i]);
      await page.click('#ask-btn');
      await page.waitForTimeout(50);
      nudge.push(await page.evaluate(() => {
        const n = document.getElementById('ask-nudge');
        return n.classList.contains('hidden') ? null : n.textContent.replace(/\s+/g,' ').trim();
      }));
    }

    // apparition exactement a la 7e question
    const premier = nudge.findIndex(x => x !== null);
    const attendu = sc.qs.length >= 7 ? 6 : -1;
    if (premier !== attendu) {
      erreurs.push(`${sc.nom} : rappel apparu a l'index ${premier}, attendu ${attendu}`);
    }

    await page.selectOption('#diagnosis-select', 'saine');
    await page.click('#guess-btn');
    await page.waitForTimeout(200);

    const r = await page.evaluate(() => {
      const e = document.getElementById('diag-economy');
      return {
        titre: document.getElementById('result-title').textContent.trim(),
        ton: e.className,
        txt: e.textContent.replace(/\s+/g,' ').trim(),
        conclusion: (e.querySelector('.da-conclusion')||{}).textContent || ''
      };
    });

    const doitAlerter = sc.qs.length >= 7;
    if (doitAlerter !== (r.ton.indexOf('is-diff') !== -1)) {
      erreurs.push(`${sc.nom} : ton de l'encadre incorrect (${r.ton})`);
    }
    if (doitAlerter && !r.conclusion) erreurs.push(`${sc.nom} : conseil d'optimisation manquant`);
    if (!doitAlerter && r.conclusion) erreurs.push(`${sc.nom} : conseil affiche a tort`);

    console.log(`--- ${sc.nom} — cas tire : ${r.titre}`);
    console.log(`    rappel en session : ${nudge.filter(Boolean).length} affichage(s), 1er a la question ${premier+1 || '—'}`);
    if (nudge.find(Boolean)) console.log(`    « ${nudge.find(Boolean).slice(0,150)} »`);
    console.log(`    encadre : ${r.txt.slice(0, 260)}`);
    console.log('');
  }

  console.log('Erreurs : ' + erreurs.length);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
})();

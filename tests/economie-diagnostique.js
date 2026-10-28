// Le rappel d'interrogatoire : son seuil de 7 questions, et l'ABSENCE de l'ancien encadre.
//
// Cette suite controlait un encadre « Economie diagnostique » qui annoncait le nombre minimal
// de questions suffisantes et reprochait les suivantes. Il a ete retire : son calcul etait juste
// au sens logique et faux au sens clinique — un signe pose ne suffit pas a conclure, il faut
// encore les reponses NEGATIVES des autres pour ecarter les diagnostics concurrents. Il
// apprenait a ecourter l'interrogatoire la ou il faut le completer.
//
// Ce qui reste a eprouver : le rappel affiche PENDANT la serie, qui invite a cibler ses
// questions sans pretendre qu'un nombre donne suffise. Et le fait que l'encadre ne revienne
// pas : c'est pour cela que cette suite survit a ce qu'elle controlait.
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
  // Supabase est SIMULE et non coupe. Depuis que les trois modes d'entrainement sont fermes
  // hors ligne — un serveur injoignable voulant dire corrige non charge et resultats non
  // enregistres —, couper le reseau ferme aussi les boutons que cette suite doit cliquer.
  await page.route('**://*.supabase.co/**', r => {
    const u = r.request().url();
    const j = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/rest/v1/profiles') && r.request().method() === 'GET') {
      return j([{ id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
                 annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true,
                 active_session: null, active_session_at: null }]);
    }
    if (u.includes('/rest/v1/')) return j([]);
    return r.fulfill({ status: 204, body: '' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u', email:'e@e.fr' }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id:'u', email:'e@e.fr', prenom:'T', nom:'A', annee:'TCEO1',
      faculte:'UFR Odontologie Dijon', approved:true }));
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

    const r = await page.evaluate(() => ({
      titre: document.getElementById('result-title').textContent.trim(),
      // L'encadre ne doit plus EXISTER. Le chercher par son identifiant suffit : s'il
      // reapparaissait, c'est par la qu'il reviendrait.
      encadre: !!document.getElementById('diag-economy'),
      // Et son contenu ne doit pas renaitre ailleurs sous une autre forme : la tournure
      // « N question(s) suffisai(en)t » est la signature de ce qui a ete retire.
      resultats: (document.getElementById('result-card') || document.body)
        .textContent.replace(/\s+/g, ' ')
    }));

    if (r.encadre) {
      erreurs.push(`${sc.nom} : l'encadre « Economie diagnostique » est revenu dans les resultats`);
    }
    if (/suffisai(?:t|ent) a affirmer|suffisai(?:t|ent) à affirmer/.test(r.resultats)) {
      erreurs.push(`${sc.nom} : les resultats annoncent de nouveau un nombre de questions suffisantes`);
    }
    if (/aurai(?:t|ent) pu etre optimis|auraient pu être optimis/.test(r.resultats)) {
      erreurs.push(`${sc.nom} : les resultats reprochent de nouveau les questions superflues`);
    }

    console.log(`--- ${sc.nom} — cas tire : ${r.titre}`);
    console.log(`    rappel en session : ${nudge.filter(Boolean).length} affichage(s), 1er a la question ${premier+1 || '—'}`);
    if (nudge.find(Boolean)) console.log(`    « ${nudge.find(Boolean).slice(0,150)} »`);
    console.log(`    encadre « Economie diagnostique » : ${r.encadre ? 'PRESENT' : 'absent, comme voulu'}`);
    console.log('');
  }

  console.log('Erreurs : ' + erreurs.length);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
})();

// Analyse differentielle et economie diagnostique : verifie que la correction nomme bien
// les signes qui separaient la reponse donnee du diagnostic reel, et distingue un signe
// recueilli d'un signe jamais demande.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const POSEES = ['froid', 'percussion'];   // les deux seules questions posées à chaque tour
const GUESS  = 'necrose';                 // proposition fixe : fausse la plupart du temps

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token: 'test', refresh_token: 'test',
      expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
    }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
      annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true
    }));
    // Le repli hors ligne exige un passage en ligne de moins de 24 h : sans cette date, il
    // refuserait d'ouvrir l'application et aucune suite ne pourrait plus rien tester.
    localStorage.setItem('endodiag-last-online', JSON.stringify(Date.now()));

  });

  const vus = new Map();
  const erreurs = [];

  for (let tour = 0; tour < 40 && vus.size < 12; tour++) {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
    await page.click('#hub-diagnostic-btn');
    await page.click('#start-single-btn');
    await page.waitForTimeout(80);

    for (const q of POSEES) {
      await page.selectOption('#question-select', q);
      await page.click('#ask-btn');
      await page.waitForTimeout(60);
    }
    await page.selectOption('#diagnosis-select', GUESS);
    await page.click('#guess-btn');
    await page.waitForTimeout(150);

    const r = await page.evaluate(() => {
      const diff = document.getElementById('diag-differential');
      const eco  = document.getElementById('diag-economy');
      const lis  = [...diff.querySelectorAll('.da-signs li')].map(li => ({
        vu: li.classList.contains('da-seen'),
        txt: li.querySelector('.da-name').textContent.trim(),
        nonPosee: li.textContent.indexOf('question non posée') !== -1
      }));
      return {
        titre: document.getElementById('result-title').textContent.trim(),
        juste: document.getElementById('verdict').className.indexOf('ok') !== -1,
        diffVisible: !diff.classList.contains('hidden'),
        ecoVisible: !eco.classList.contains('hidden'),
        ecoTxt: eco.textContent.replace(/\s+/g, ' ').trim(),
        conclusion: (diff.querySelector('.da-conclusion') || {}).textContent || '',
        lis
      };
    });

    if (vus.has(r.titre)) continue;
    vus.set(r.titre, r);

    // --- invariants ---
    if (r.juste && r.diffVisible) erreurs.push(`${r.titre} : differentiel affiche sur une BONNE reponse`);
    if (!r.juste && !r.diffVisible) erreurs.push(`${r.titre} : differentiel MANQUANT sur une erreur`);
    if (!r.ecoVisible) erreurs.push(`${r.titre} : encadre economie manquant`);
    if (!/\d+ question/.test(r.ecoTxt)) erreurs.push(`${r.titre} : economie sans nombre -> ${r.ecoTxt}`);

    // Seules « le test au froid » et « la douleur a la percussion » ont ete posees :
    // tout autre signe doit etre marque comme non pose, et ces deux-la comme vus.
    for (const li of r.lis) {
      const devraitEtreVu = li.txt.includes('froid') && !li.txt.includes('soulagement')
                          || li.txt.includes('percussion');
      if (devraitEtreVu && !li.vu) erreurs.push(`${r.titre} : « ${li.txt} » posee mais marquee non vue`);
      if (!devraitEtreVu && li.vu) erreurs.push(`${r.titre} : « ${li.txt} » NON posee mais marquee vue`);
      if (li.vu === li.nonPosee) erreurs.push(`${r.titre} : « ${li.txt} » marquage incoherent`);
    }
  }

  console.log(`Diagnostics rencontres : ${vus.size} / 12\n`);
  for (const [t, r] of vus) {
    const n = r.lis.length;
    console.log(`${r.juste ? '✓' : '✗'} ${t}`);
    console.log(`    economie : ${r.ecoTxt.replace('Économie diagnostique', '').trim().slice(0, 120)}`);
    if (r.diffVisible) {
      console.log(`    ${n} signe(s) discriminant(s) : ` +
        r.lis.map(l => `${l.vu ? '✓' : '✗'}${l.txt}`).join(', '));
      console.log(`    -> ${r.conclusion.trim().slice(0, 150)}`);
    }
  }
  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
})();

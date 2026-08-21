const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// name -> { title, urgence: {coronaire, chirurgical, medicamenteux}, final: {geste, medicamenteux} | null }
const CASES = {
  // saine
  Nora: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], medicamenteux: ['aucun'] } },
  Ethan: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], medicamenteux: ['aucun'] } },
  Gabriel: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], medicamenteux: ['aucun'] } },
  // hyperhemie
  Yasmine: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Théo: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Chiara: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Robert: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Sylvie: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  // reversible
  Élise: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Thomas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Sophie: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Lucas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
  Camille: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['soin'], medicamenteux: ['aucun'] } },
};

// irreversible has name collisions with reversible (Lucas, Thomas, Sophie) -- disambiguate via title
const IRREVERSIBLE = {
  Lucas: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Hugo: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Emma: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Mathis: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Corentin: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Aïcha: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Séverine: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Anaïs: { urgence: { coronaire: ['pulpotomie_therapeutique'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Thomas: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Sophie: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Jean: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Fatou: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Benoît: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Justine: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Karim: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Manon: { urgence: { coronaire: ['pulpotomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Michel: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Léa: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Chloé: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Rachid: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Youssef: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Pauline: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Ludovic: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
  Sabrina: { urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } },
};
['Lucas', 'Hugo', 'Emma', 'Mathis', 'Corentin', 'Aïcha', 'Séverine', 'Anaïs',
 'Thomas', 'Sophie', 'Jean', 'Fatou', 'Benoît', 'Justine', 'Karim', 'Manon',
 'Michel', 'Léa', 'Chloé', 'Rachid', 'Youssef', 'Pauline', 'Ludovic', 'Sabrina'].forEach(n => {
  CASES[n + '|Pulpite aiguë irréversible'] = { title: 'Pulpite aiguë irréversible', ...IRREVERSIBLE[n] };
});

['Frédéric', 'Amandine', 'Bruno', 'Nathalie', 'Olivier'].forEach(n => {
  CASES[n] = { title: 'Syndrome mixte', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Léon', 'Margaux', 'Étienne', 'Noémie', 'Romain', 'Agathe'].forEach(n => {
  CASES[n + '|Nécrose pulpaire'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
CASES['Bernard'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] } };
['Céline', 'Pierre', 'Isabelle', 'Xavier', 'Valérie'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Michel', 'Véronique', 'Solène'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], medicamenteux: ['antalgique'] } };
});
['Roger'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Denis', 'Martine', 'Fabien'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['drainage_transfixion'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Aurélie'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Nicolas', 'Sandrine', 'Thierry'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], medicamenteux: ['antalgique'] } };
});
['Corinne', 'Damien', 'Élodie'].forEach(n => {
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['drainage_fistulaire'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Grégoire'].forEach(n => {
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Julien', 'Nadia', 'Marc'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['aucun'], medicamenteux: ['antalgique', 'antibiotiques'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Inès'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
});
['Rémi', 'Brigitte'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['curetage_etanche'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], medicamenteux: ['antalgique'] } };
});
['Gilbert'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Victor', 'Laura', 'Hakim'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['pulpectomie_urgence', 'curetage_etanche'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: { geste: ['endo_complet'], medicamenteux: ['antalgique'] } };
});
['Paul'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
});
['Fabrice', 'Ghislaine', 'Bastien'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['curetage_etanche'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], medicamenteux: ['antalgique'] } };
});
['Serge'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Adam', 'Claire', 'Antoine', 'Nathan', 'Julie'].forEach(n => {
  CASES[n] = { title: 'Cellulite diffuse', urgence: { coronaire: ['aucun'], chirurgical: ['referer'], medicamenteux: ['aucun'] }, final: null };
});
['Denise', 'Régis', 'Bernadette', 'Lucien'].forEach(n => {
  CASES[n] = { title: 'Cellulite diffuse', urgence: { coronaire: ['aucun'], chirurgical: ['referer'], medicamenteux: ['aucun'] }, final: null };
});

async function checkBoxes(page, groupKey, values) {
  for (const v of values) await page.check(`input[data-group="${groupKey}"][value="${v}"]`);
}

async function run() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();

  // Depuis l'ajout des comptes, une porte de connexion recouvre l'application.
  // On se presente comme un compte deja valide sur cet appareil : Supabase etant
  // injoignable depuis le bac a sable, le repli hors ligne laisse entrer.
  // Coupe net l'acces a Supabase : le repli hors ligne s'active immediatement,
  // au lieu d'attendre le delai maximal de 12 s a chaque cas.
  await page.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));

  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token: 'test', refresh_token: 'test',
      expires_at: Date.now() + 3600000, user_id: 'test-user', email: 'test@example.com'
    }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id: 'test-user', email: 'test@example.com', prenom: 'Test', nom: 'Auto',
      annee: 'TCEO1', faculte: 'UFR Odontologie Dijon', approved: true
    }));
  });

  // Build lookup by "name|title" first (for collision cases), fallback to plain name
  const results = [];
  const seen = new Set();
  const allKeys = Object.keys(CASES);
  let attempts = 0;

  while (seen.size < allKeys.length && attempts < 3000) {
    attempts++;
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    // attendre que la porte de connexion se soit levee (repli hors ligne)
    await page.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
    await page.click('#hub-tx-btn');
    await page.click('#start-tx-btn');
    await page.waitForTimeout(90);
    const title = (await page.textContent('#tx-title')).trim();
    const def = (await page.textContent('#tx-def')).trim();

    let matchKey = null;
    let entry = null;
    for (const k of allKeys) {
      const name = k.split('|')[0];
      if (def.indexOf(name) === -1) continue;
      if (CASES[k].title !== title) continue;
      matchKey = k;
      entry = CASES[k];
      break;
    }
    if (!matchKey || seen.has(matchKey)) continue;
    seen.add(matchKey);

    await checkBoxes(page, 'coronaire', entry.urgence.coronaire);
    await checkBoxes(page, 'chirurgical', entry.urgence.chirurgical);
    await checkBoxes(page, 'medicamenteux', entry.urgence.medicamenteux);
    await page.click('#tx-step-submit-btn');
    await page.waitForTimeout(150);

    if (entry.final) {
      const hasGeste = await page.locator('input[data-group="geste"]').count();
      if (hasGeste === 0) {
        results.push(matchKey + ': EXPECTED final step but none appeared');
        continue;
      }
      await checkBoxes(page, 'geste', entry.final.geste);
      await checkBoxes(page, 'medicamenteux', entry.final.medicamenteux);
      await page.click('#tx-step-submit-btn');
      await page.waitForTimeout(150);
    } else {
      const resultVisible = await page.locator('#tx-result-card:not(.hidden)').count();
      if (resultVisible === 0) {
        results.push(matchKey + ': EXPECTED single-step but a final step appeared');
        continue;
      }
    }

    const verdict = (await page.textContent('#tx-verdict')).trim();
    if (verdict.indexOf('Tous les choix sont corrects') === -1) {
      const recap = (await page.textContent('#tx-result-recap')).replace(/\s+/g, ' ').trim();
      results.push(matchKey + ': FAIL - ' + verdict + ' | ' + recap.slice(0, 300));
    }
  }

  console.log('Tested', seen.size, '/', allKeys.length, 'unique named cases');
  const missing = allKeys.filter(k => !seen.has(k));
  console.log('Missing (never rolled):', missing);
  console.log('Failures:', results.length);
  results.forEach(r => console.log(' -', r));

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });

const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// name -> { title, urgence: {coronaire, chirurgical, medicamenteux}, final: {geste, coronaire, medicamenteux} | null }
const CASES = {
  // saine
  Nora: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['aucune'], medicamenteux: ['aucun'] } },
  Ethan: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['aucune'], medicamenteux: ['aucun'] } },
  Gabriel: { title: 'Dent saine', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['aucune'], medicamenteux: ['aucun'] } },
  // hyperhemie
  Yasmine: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Théo: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Chiara: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Robert: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Sylvie: { title: 'Hyperhémie pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  // reversible
  Élise: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Thomas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Sophie: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Lucas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Camille: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['curetage'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
};

// irreversible has name collisions with reversible (Lucas, Thomas, Sophie) -- disambiguate via title
const IRREVERSIBLE = {
  Lucas: { urgence: { coronaire: ['curetage', 'pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Hugo: { urgence: { coronaire: ['curetage', 'pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Emma: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Corentin: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Aïcha: { urgence: { coronaire: ['curetage', 'pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Séverine: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Thomas: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Sophie: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Jean: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Benoît: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Justine: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Michel: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Léa: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Youssef: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Pauline: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Sabrina: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
};
['Lucas', 'Hugo', 'Emma', 'Corentin', 'Aïcha', 'Séverine',
 'Thomas', 'Sophie', 'Jean', 'Benoît', 'Justine',
 'Michel', 'Léa', 'Youssef', 'Pauline', 'Sabrina'].forEach(n => {
  CASES[n + '|Pulpite aiguë irréversible'] = { title: 'Pulpite aiguë irréversible', ...IRREVERSIBLE[n] };
});

['Frédéric', 'Amandine', 'Bruno', 'Nathalie', 'Olivier'].forEach(n => {
  CASES[n] = { title: 'Syndrome mixte', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Léon', 'Margaux', 'Étienne', 'Noémie', 'Romain', 'Agathe'].forEach(n => {
  CASES[n + '|Nécrose pulpaire'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
CASES['Bernard'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['extraction'], coronaire: ['aucune'], medicamenteux: ['antalgique', 'bain_bouche'] } };
['Céline', 'Pierre', 'Isabelle', 'Xavier', 'Valérie'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Michel', 'Véronique'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Roger'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Denis', 'Martine', 'Fabien'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['drainage_transfixion'], medicamenteux: ['antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Aurélie'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
// Dent déjà traitée avec reprise carieuse ou obturation réinfiltrée : on cure et on rescelle.
['Nicolas'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
// Couronne fracturée juxta-gingivale : rien à cureter, seule l'étanchéité est à rétablir.
['Sandrine'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Corinne', 'Damien', 'Élodie'].forEach(n => {
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['drainage_fistulaire'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Maryse'].forEach(n => {
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['drainage_fistulaire'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Grégoire'].forEach(n => {
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Julien', 'Nadia', 'Marc'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antalgique', 'antibiotiques'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Inès'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
});
// Dent déjà traitée avec reprise carieuse ou obturation réinfiltrée : on cure et on rescelle.
['Rémi'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
// Couronne fracturée juxta-gingivale : rien à cureter, seule l'étanchéité est à rétablir.
['Brigitte'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Gilbert'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Victor', 'Laura', 'Hakim'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Paul'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
});
// Dent déjà traitée avec reprise carieuse ou obturation réinfiltrée : on cure et on rescelle.
['Fabrice'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
// Couronne fracturée juxta-gingivale : rien à cureter, seule l'étanchéité est à rétablir.
['Bastien'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Serge'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Solène'].forEach(n => {
  CASES[n] = { title: 'Parodontite apicale aiguë', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Thierry'].forEach(n => {
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['antibiotiques', 'antalgique'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Ghislaine'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antibiotiques', 'antalgique', 'bain_bouche'] }, final: { geste: ['retraitement'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
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
      await checkBoxes(page, 'coronaire_final', entry.final.coronaire);
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

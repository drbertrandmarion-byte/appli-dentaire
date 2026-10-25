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
  Élise: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Thomas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Sophie: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Lucas: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
  Camille: { title: 'Pulpite réversible', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['rien'], coronaire: ['restauration_definitive'], medicamenteux: ['aucun'] } },
};

// irreversible has name collisions with reversible (Lucas, Thomas, Sophie) -- disambiguate via title
const IRREVERSIBLE = {
  Lucas: { urgence: { coronaire: ['curetage', 'pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Hugo: { urgence: { coronaire: ['curetage', 'pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Emma: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Corentin: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Aïcha: { urgence: { coronaire: ['pulpotomie_therapeutique', 'reconstitution_definitive'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: null },
  Séverine: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Thomas: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Sophie: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Jean: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Benoît: { urgence: { coronaire: ['curetage', 'pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Justine: { urgence: { coronaire: ['pulpotomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Michel: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Léa: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Youssef: { urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Pauline: { urgence: { coronaire: ['pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
  Sabrina: { urgence: { coronaire: ['pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } },
};
['Lucas', 'Hugo', 'Emma', 'Corentin', 'Aïcha', 'Séverine',
 'Thomas', 'Sophie', 'Jean', 'Benoît', 'Justine',
 'Michel', 'Léa', 'Youssef', 'Pauline', 'Sabrina'].forEach(n => {
  CASES[n + '|Pulpite aiguë irréversible'] = { title: 'Pulpite aiguë irréversible', ...IRREVERSIBLE[n] };
});

['Frédéric', 'Amandine', 'Bruno', 'Nathalie', 'Olivier'].forEach(n => {
  CASES[n] = { title: 'Syndrome mixte', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['ains', 'antalgique'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
// Lésion carieuse ou restauration infiltrée : il y a de quoi cureter, et l'étanchéité est à refaire.
['Léon', 'Étienne', 'Noémie', 'Romain'].forEach(n => {
  CASES[n + '|Nécrose pulpaire'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['curetage', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
// Restauration récente, donc étanche et sans reprise carieuse : rien à cureter, rien à reconstituer.
// Ces deux-là sont séparés du groupe précédent à dessein — regroupés, une erreur sur leur corrigé
// passerait inaperçue, comme c'est déjà arrivé sur les fractures coronaires.
['Margaux', 'Agathe'].forEach(n => {
  CASES[n + '|Nécrose pulpaire'] = { title: 'Nécrose pulpaire', urgence: { coronaire: ['aucun'], chirurgical: ['aucun'], medicamenteux: ['aucun'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
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
  CASES[n] = { title: 'Abcès apical aigu', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'curetage_granulome'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
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
  CASES[n] = { title: 'Abcès apical chronique', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_fistulaire', 'curetage_granulome'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Julien', 'Nadia', 'Marc'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['aucun'], medicamenteux: ['antalgique', 'antibiotiques'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Inès'].forEach(n => {
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'curetage_granulome'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
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
  CASES[n] = { title: 'Cellulite séreuse', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'curetage_granulome'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
});
['Victor', 'Laura', 'Hakim'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['curetage', 'pulpectomie_urgence', 'reconstitution_provisoire'], chirurgical: ['drainage_muqueuse'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: { geste: ['endo_complet'], coronaire: ['restauration_definitive'], medicamenteux: ['antalgique'] } };
});
['Paul'].forEach(n => {
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse', 'curetage_granulome'], medicamenteux: ['antalgique', 'antibiotiques', 'bain_bouche'] }, final: null };
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
  CASES[n] = { title: 'Cellulite suppurée (collectée)', urgence: { coronaire: ['aucun'], chirurgical: ['extraction', 'drainage_muqueuse', 'curetage_granulome'], medicamenteux: ['antalgique', 'bain_bouche'] }, final: null };
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

    // Le rappel sur le Cavit ne doit apparaitre que la ou la pulpe reste integralement vivante.
    // Ailleurs — pulpotomie, pulpectomie, dent deja depulpee — il n'a plus d'objet, et un rappel
    // affiche partout est un rappel que l'etudiant apprend a ne plus lire.
    const PULPE_VIVANTE = ['Hyperhémie pulpaire', 'Pulpite réversible'];
    const libelle = await page.$$eval('input[data-group="coronaire"][value="reconstitution_provisoire"]',
      es => es.map(e => e.parentNode.textContent.trim()));
    if (!libelle.length) {
      results.push(matchKey + ': item « reconstitution provisoire » absent du groupe coronaire');
    } else {
      const porteLeRappel = /Cavit/.test(libelle[0]);
      const devrait = PULPE_VIVANTE.indexOf(title) !== -1;
      if (porteLeRappel !== devrait) {
        results.push(matchKey + ': rappel Cavit ' + (porteLeRappel ? 'present' : 'absent')
          + ' alors qu\'il devrait etre ' + (devrait ? 'present' : 'absent') + ' sur « ' + title + ' »');
      }
    }

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

  // --- La fiche recapitulative imprimable ---
  // Ses trois axes y sont enchaines par des « + » sans libelle. Un « Aucun » isole en fin de ligne
  // s'y lit comme un acte de plus, dont on ne sait pas de quoi il parle : c'est un etudiant qui l'a
  // signale, pas un test. On garde donc le symptome exact sous surveillance.
  await page.goto('http://localhost:9300/index.html');
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });
  await page.click('#hub-tx-btn');
  await page.waitForTimeout(150);
  await page.click('#tx-recap-btn');
  await page.waitForTimeout(700);
  const lignesFiche = await page.$$eval('.recap-tx', ns => ns.map(n => n.textContent.trim()));
  if (!lignesFiche.length) {
    results.push('FICHE RECAP : aucune ligne rendue — le controle ci-dessous ne prouverait rien');
  }
  lignesFiche.forEach(l => {
    if (/[+·]\s*Aucun\s*$/.test(l)) {
      results.push('FICHE RECAP : ligne se terminant par un « Aucun » sans sujet — ' + l.slice(0, 120));
    }
  });
  console.log('Fiche recapitulative :', lignesFiche.length, 'lignes controlees');

  // --- La fiche imprimee doit dire la MEME chose que le corrige ---
  // Deux tables vivent cote a cote : TX_MULTISTEP_CASES, sur laquelle l'etudiant est note, et
  // TX_RECAP_TYPES, qu'il imprime. Rien ne les reliait. L'AINS ajoute a l'urgence du syndrome
  // mixte est entre dans les cas sans entrer dans la fiche, et la suite est restee muette : la
  // fiche aurait appris le contraire de la correction. On confronte donc, pathologie par
  // pathologie, les combinaisons d'actes des deux tables. La fiche ne garde qu'une ligne par
  // situation distincte — c'est voulu —, donc on compare des ENSEMBLES de combinaisons, pas
  // des listes : chaque situation de la fiche doit exister parmi les cas, et chaque situation
  // des cas doit figurer sur la fiche.
  {
    const tables = await page.evaluate(() => {
      if (!window.EndoTxTables) return null;
      const cle = (o) => !o ? 'rien' : ['coronaire', 'chirurgical', 'medicamenteux', 'geste']
        .map(a => a + '=' + ((o[a] || []).join('+') || '-')).join(' | ');
      const lis = (table, champAxes, champFinal) => {
        const out = {};
        Object.keys(table).forEach(id => {
          const ens = {};
          (table[id] || []).forEach(v => {
            ens[cle(v[champAxes]) + ' >>> ' + cle(v[champFinal])] = true;
          });
          out[id] = Object.keys(ens).sort();
        });
        return out;
      };
      return {
        cas:   lis(window.EndoTxTables.cas,   'axes', 'finalAxes'),
        fiche: lis(window.EndoTxTables.fiche, 'axes', 'finalAxes')
      };
    });
    if (!tables) {
      results.push('FICHE RECAP : window.EndoTxTables est absent — la confrontation ne prouverait rien');
    } else {
      const pathologies = Object.keys(tables.cas);
      if (pathologies.length < 12) {
        results.push('FICHE RECAP : seulement ' + pathologies.length + ' pathologies dans les cas, ce controle ne couvre pas tout');
      }
      pathologies.forEach(id => {
        const fiche = tables.fiche[id];
        if (!fiche) { results.push('FICHE RECAP : « ' + id + ' » n\'a aucune ligne sur la fiche imprimable'); return; }
        tables.cas[id].forEach(c => {
          if (fiche.indexOf(c) < 0) {
            results.push('FICHE RECAP : « ' + id + ' » — une situation du corrige manque sur la fiche imprimee : ' + c);
          }
        });
        fiche.forEach(f => {
          if (tables.cas[id].indexOf(f) < 0) {
            results.push('FICHE RECAP : « ' + id + ' » — la fiche imprimee annonce une situation que le corrige ignore : ' + f);
          }
        });
      });
    }
  }

  // ---- Le tirage hors revision epuise les douze pathologies avant d'en repeter une ----
  // Au tirage avec remise, un etudiant pouvait revoir trois fois la meme pathologie avant
  // d'en decouvrir une autre. L'enseignante l'a signale : « il retourne toujours sur les
  // memes ». Le tirage vide desormais un sac avant de le rebattre, et c'est verifie SANS
  // rechargement de page — une page neuve rebat le sac et masquerait la panne.
  {
    await page.goto('http://localhost:9300/index.html');
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForSelector('#auth-gate.hidden', { state: 'attached', timeout: 15000 });

    const tire = await page.evaluate(() => {
      if (!window.EndoTirage || !window.EndoDiagnosisOrder) return null;
      const N = window.EndoDiagnosisOrder.length;
      const out = { N: N, diagnostic: [], therapeutique: [] };
      for (let i = 0; i < 2 * N; i++) {
        out.diagnostic.push(window.EndoTirage.diagnostic());
        out.therapeutique.push(window.EndoTirage.therapeutique());
      }
      return out;
    });
    const dedans = (l) => l.length - new Set(l).size;
    if (!tire) {
      results.push('TIRAGE : window.EndoTirage est introuvable — la regle du sac n\'est eprouvee nulle part');
    } else {
      for (const mode of ['diagnostic', 'therapeutique']) {
        const suite = tire[mode], N = tire.N;
        const premier = suite.slice(0, N), second = suite.slice(N, 2 * N);
        if (dedans(premier)) {
          results.push('TIRAGE ' + mode + ' : ' + dedans(premier) + ' repetition(s) dans les ' + N +
                       ' premiers cas — une pathologie revient avant que toutes soient passees');
        }
        if (new Set(premier).size !== N) {
          results.push('TIRAGE ' + mode + ' : ' + new Set(premier).size + ' pathologies distinctes sur ' + N);
        }
        if (dedans(second)) {
          results.push('TIRAGE ' + mode + ' : ' + dedans(second) + ' repetition(s) dans le deuxieme tour complet');
        }
        if (suite[N] === suite[N - 1]) {
          results.push('TIRAGE ' + mode + ' : meme pathologie au raccord entre deux series — ' + suite[N]);
        }
      }
    }
    // Controle du controle : la meme mesure sur une suite fautive doit crier.
    if (!dedans(['a', 'b', 'a'])) {
      results.push('AUTOCONTROLE : le detecteur de repetition ne voit pas un doublon pose expres');
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

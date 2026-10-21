// Back-office : rendu par promotion + exports CSV, sur une base simulee.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const PROFILES = [
  { id:'u1', email:'a@x.fr', prenom:'Alice',  nom:'Martin', annee:'3ème année', faculte:'UFR Odontologie Dijon', approved:true,  created_at:'2026-01-10T09:00:00Z', last_seen_at:'2026-08-19T09:00:00Z' },
  { id:'u2', email:'b@x.fr', prenom:'Bruno',  nom:'Dupont', annee:'3ème année', faculte:'UFR Odontologie Dijon', approved:true,  created_at:'2026-01-11T09:00:00Z', last_seen_at:'2026-08-18T09:00:00Z' },
  { id:'u3', email:'c@x.fr', prenom:'Chloé',  nom:'Bernard; "test"', annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2026-02-01T09:00:00Z', last_seen_at:null },
  { id:'u4', email:'d@x.fr', prenom:'David',  nom:'Petit',  annee:'TCEO1',      faculte:'UFR Odontologie Dijon', approved:false, created_at:'2026-08-01T09:00:00Z', last_seen_at:null }
];
const RESULTS = [
  { id:1, user_id:'u1', mode:'diagnostic',    serie:5, score:4, created_at:'2026-08-01T09:00:00Z' },
  { id:2, user_id:'u1', mode:'therapeutique', serie:5, score:3, created_at:'2026-08-02T09:00:00Z' },
  { id:3, user_id:'u2', mode:'diagnostic',    serie:10, score:5, created_at:'2026-08-03T09:00:00Z' }
];
// 3eme annee rate massivement l'abces chronique ; TCEO1 rate la cellulite diffuse.
const CASES = [];
// Chaque cas porte une date : c'est elle que le back-office affiche pour montrer QUAND un etudiant
// s'est entraine, et sans elle la colonne « Dernier cas » comme la feuille « Cas joues » seraient
// controlees a vide.
let jour = 0;
const quand = () => new Date(Date.UTC(2026, 7, 20 - (jour++ % 20), 14, 30)).toISOString();
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'abces_chronique',  correct:i < 2, created_at:quand() });
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u2', mode:'therapeutique', diagnosis_id:'abces_chronique',  correct:i < 9, created_at:quand() });
for (let i = 0; i < 11; i++) CASES.push({ user_id:'u3', mode:'diagnostic',    diagnosis_id:'cellulite_diffuse', correct:i < 3, created_at:quand() });
for (let i = 0; i < 4;  i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'necrose',           correct:true, created_at:quand() });
// u4 n'est pas valide : ses cas ne doivent pas apparaitre dans le classeur.
CASES.push({ user_id:'u4', mode:'diagnostic', diagnosis_id:'necrose', correct:true, created_at:quand() });

(async () => {
  const browser = await chromium.launch({ acceptDownloads: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport:{width:1100,height:900} });
  const page = await ctx.newPage();

  await page.route('**://*.supabase.co/**', route => {
    const u = route.request().url();
    const json = b => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(b) });
    if (u.includes('/rest/v1/admins'))       return json([{ user_id:'admin1' }]);
    if (u.includes('/rest/v1/profiles'))     return json(PROFILES);
    if (u.includes('/rest/v1/results'))      return json(RESULTS);
    if (u.includes('/rest/v1/case_results')) return json(CASES);
    return json([]);
  });
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', user_id:'admin1', email:'prof@x.fr' }));
  });

  await page.goto('http://localhost:9300/admin.html');
  await page.waitForSelector('#admin-view:not(.hidden)', { timeout:15000 });

  const promos = await page.$$eval('#promo-filter option', o => o.map(x => x.textContent));
  console.log('1. promotions proposees :', JSON.stringify(promos));

  const lire = async () => await page.$$eval('#weak-body tr', rs => rs.map(r =>
    [...r.querySelectorAll('td')].map(c => c.textContent.trim()).slice(0, 5).join(' | ')));

  console.log('\n2. TOUTES :');            (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  await page.selectOption('#promo-filter', '3ème année');
  console.log('\n3. 3eme annee :');        (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  await page.selectOption('#promo-filter', 'TCEO1');
  console.log('\n4. TCEO1 :');             (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  // --- les deux modes comptes a part dans la liste des comptes valides ---
  // Un seul nombre melangeait les cas de diagnostic et ceux de choix therapeutique : on ne
  // pouvait pas savoir si un etudiant travaillait l'un, l'autre, ou l'un sans l'autre.
  // Le jeu d'essai le rend verifiable : Alice n'a que du diagnostic (16 cas, 6 reussis),
  // Bruno n'a que du therapeutique (12 cas, 9 reussis).
  const pbJs = [];
  await page.selectOption('#promo-filter', '__toutes__');
  const lignes = await page.$$eval('#approved-body tr', rs => rs.map(r =>
    [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  const ligneDe = nom => lignes.filter(l => l[0] && l[0].indexOf(nom) === 0)[0];
  const alice = ligneDe('Alice'), bruno = ligneDe('Bruno');
  if (!alice || !bruno) {
    pbJs.push('comptes valides : Alice ou Bruno introuvable dans la liste');
  } else {
    const cas = l => l[5] || '';
    if (!/Diagnostic 16 \(38 %\)/.test(cas(alice))) {
      pbJs.push('comptes valides : les 16 cas de diagnostic d\'Alice ne sont pas comptes a part — lu « ' + cas(alice) + ' »');
    }
    if (!/Thérapeutique — aucun/.test(cas(alice))) {
      pbJs.push('comptes valides : Alice n\'a joue aucun cas therapeutique, et rien ne le dit — lu « ' + cas(alice) + ' »');
    }
    if (!/Thérapeutique 12 \(75 %\)/.test(cas(bruno))) {
      pbJs.push('comptes valides : les 12 cas therapeutiques de Bruno ne sont pas comptes a part — lu « ' + cas(bruno) + ' »');
    }
    if (!/Diagnostic — aucun/.test(cas(bruno))) {
      pbJs.push('comptes valides : Bruno n\'a joue aucun cas de diagnostic, et rien ne le dit — lu « ' + cas(bruno) + ' »');
    }
  }
  const resume = (await page.textContent('#stats')).replace(/\s+/g, ' ');
  if (!/cas diagnostic/.test(resume) || !/cas thérapeutique/.test(resume)) {
    pbJs.push('bandeau : le total des cas ne distingue pas les deux modes — lu « ' + resume.trim() + ' »');
  }
  console.log('\n4bis. comptes valides, cas par mode :');
  console.log('    Alice :', alice ? alice[5] : '—');
  console.log('    Bruno :', bruno ? bruno[5] : '—');
  pbJs.forEach(x => console.log('  ! ' + x));
  if (pbJs.length) process.exitCode = 1;

  // --- export du classeur ---
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout:15000 }),
    page.click('#export-btn')
  ]);
  const chemin = '/tmp/' + dl.suggestedFilename();
  await dl.saveAs(chemin);
  console.log('\n5. classeur exporte ->', dl.suggestedFilename());
  console.log('   message :', (await page.textContent('#global-msg')).trim());

  await page.selectOption('#promo-filter', '__toutes__');
  await page.locator('.card').last().screenshot({ path:'/tmp/admin.png' });
  await browser.close();

  // --- controle structurel du classeur ---
  // Le .xlsx est ecrit a la main : on verifie ici qu'il constitue bien une archive valide et un
  // classeur conforme. Un compteur de styles faux est la cause classique du message « contenu
  // illisible » d'Excel, et il passerait totalement inapercu a l'oeil nu.
  const { execFileSync } = require('child_process');
  const script = `
import zipfile, re, sys, xml.etree.ElementTree as ET
f = ${JSON.stringify(chemin)}
z = zipfile.ZipFile(f)
pb = []
if z.testzip() is not None: pb.append('CRC errone')
for n in z.namelist():
    try: ET.fromstring(z.read(n))
    except Exception as e: pb.append('XML mal forme : %s (%s)' % (n, e))
s = z.read('xl/styles.xml').decode()
for tag, child in [('numFmts','numFmt'),('fonts','font'),('fills','fill'),('borders','border'),
                   ('cellStyleXfs','xf'),('cellXfs','xf'),('cellStyles','cellStyle')]:
    m = re.search('<%s count="(\\d+)"' % tag, s)
    if not m: continue
    bloc = re.search('<%s [^>]*>(.*?)</%s>' % (tag, tag), s, re.S)
    reel = len(re.findall('<%s[ />]' % child, bloc.group(1)))
    if int(m.group(1)) != reel:
        pb.append('%s : compteur %s mais %d elements' % (tag, m.group(1), reel))
rels = z.read('xl/_rels/workbook.xml.rels').decode()
for i in (1, 2, 3, 4):
    if 'sheet%d.xml' % i not in rels: pb.append('feuille %d non reliee' % i)
    if 'xl/worksheets/sheet%d.xml' % i not in z.namelist(): pb.append('feuille %d absente' % i)
try:
    import openpyxl
    wb = openpyxl.load_workbook(f)
    print('   feuilles lues :', wb.sheetnames)
    et = wb['Etudiants'] if 'Etudiants' in wb.sheetnames else wb[wb.sheetnames[1]]
    print('   entete figee :', et.freeze_panes, '| filtre :', et.auto_filter.ref)
    types = set(type(r[5].value).__name__ for r in et.iter_rows(min_row=2) if r[5].value is not None)
    print('   type des dates :', types or 'aucune ligne')
    moy = set(type(r[8].value).__name__ for r in et.iter_rows(min_row=2) if r[8].value is not None)
    print('   type des moyennes :', moy or 'aucune valeur')
    # La feuille des cas : c'est la seule vue qui dit QUAND un etudiant s'est entraine.
    if 'Cas joues' in wb.sheetnames or 'Cas joués' in wb.sheetnames:
        cj = wb['Cas joués'] if 'Cas joués' in wb.sheetnames else wb['Cas joues']
        lignes = [r for r in cj.iter_rows(min_row=2) if r[0].value is not None]
        print('   feuille « Cas joues » :', len(lignes), 'lignes')
        if not lignes:
            pb.append('feuille des cas vide : le controle ne prouverait rien')
        dts = set(type(r[0].value).__name__ for r in lignes)
        print('   type des dates de cas :', dts)
        if dts != {'datetime'}:
            pb.append('dates de cas non reconnues comme dates : %s' % dts)
        noms = set(r[1].value for r in lignes)
        if 'Petit' in noms:
            pb.append('un compte NON valide figure dans la feuille des cas')
        # L'ordre annonce est du plus recent au plus ancien.
        dates = [r[0].value for r in lignes]
        if dates != sorted(dates, reverse=True):
            pb.append('feuille des cas : ordre non decroissant')
    else:
        pb.append('feuille « Cas joues » absente du classeur')
except ImportError:
    print('   (openpyxl absent : lecture non verifiee)')
except Exception as e:
    pb.append('lecture impossible : %s' % e)
print('\\nProblemes : %d' % len(pb))
for x in pb: print('  ! ' + x)
sys.exit(1 if pb else 0)
`;
  console.log('\n6. controle structurel du classeur :');
  try {
    console.log(execFileSync('python3', ['-c', script], { encoding:'utf8' }).trimEnd());
  } catch (e) {
    console.log((e.stdout || '') + (e.stderr || ''));
    process.exitCode = 1;
  }
})();

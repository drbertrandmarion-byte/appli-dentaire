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
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'abces_chronique',  correct:i < 2 });
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u2', mode:'therapeutique', diagnosis_id:'abces_chronique',  correct:i < 9 });
for (let i = 0; i < 11; i++) CASES.push({ user_id:'u3', mode:'diagnostic',    diagnosis_id:'cellulite_diffuse', correct:i < 3 });
for (let i = 0; i < 4;  i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'necrose',           correct:true });

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

  // --- exports ---
  const grab = async (sel) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout:10000 }), page.click(sel)]);
    const p = '/tmp/' + dl.suggestedFilename();
    await dl.saveAs(p);
    return { nom: dl.suggestedFilename(), txt: fs.readFileSync(p, 'utf8') };
  };

  const w = await grab('#export-weak-btn');
  console.log('\n5. export pathologies (TCEO1) ->', w.nom);
  console.log('   BOM present :', w.txt.charCodeAt(0) === 0xfeff);
  w.txt.split('\r\n').forEach(l => console.log('    ', l));

  const s = await grab('#export-students-btn');
  console.log('\n6. export etudiants ->', s.nom);
  s.txt.split('\r\n').forEach(l => console.log('    ', l));
  console.log('   colonnes ligne 1 :', s.txt.split('\r\n')[0].split(';').length);
  console.log('   colonnes ligne 2 :', s.txt.split('\r\n')[1].split(';').length);
  console.log('   nom avec ; et guillemets echappe :',
    /"Bernard; ""test"""/.test(s.txt));

  await page.selectOption('#promo-filter', '__toutes__');
  await page.locator('.card').last().screenshot({ path:'/tmp/admin.png' });
  await browser.close();
})();

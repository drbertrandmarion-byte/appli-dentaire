#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cohérence entre l'énoncé clinique, le texte radiographique et le schéma.

Contrairement aux autres suites, celle-ci n'ouvre pas de navigateur : elle lit directement
index.html et parcourt EXHAUSTIVEMENT tous les cas des deux modes. C'est délibéré — un test
qui tire des cas au hasard finit toujours par en manquer, et un cas jamais tiré n'est pas un
cas vérifié.

Ce qu'elle contrôle, cas par cas :
  - le texte radiographique affirme une image apicale <-> le schéma en dessine une ;
  - l'énoncé décrit une tuméfaction, une collection (godet), une fistule ou des signes
    généraux <-> le schéma les représente ;
  - l'état coronaire décrit par la radiographie (obturation réinfiltrée, couronne sur
    inlay-core, fracture coronaire, restauration récente) est aussi présent dans l'énoncé.

Usage :  python3 tests/coherence-textes.py
Sortie attendue : « Anomalies : 0 ». Code de retour non nul si une contradiction subsiste.
"""
import re, sys

import os
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(RACINE, 'index.html'), encoding='utf-8').read()

# ---------- schémas ----------
bloc = re.search(r'var DIAGRAMS = \{(.*?)\n  \};', s, re.S).group(1)
DIAG = {}
for m in re.finditer(r'\n    (\w+): \{(.*?)\n    \}', bloc, re.S):
    cfg = m.group(2); d = {}
    for k in ['caries','periapical','fistula','swelling','pulpLabel','dualRoot']:
        r = re.search(k + r':\s*("[^"]*"|true|false)', cfg)
        # Une clé absente vaut la valeur par défaut du traceur, pas « inconnu ».
        defaut = {'caries':'large','periapical':'none','fistula':'false','swelling':'none',
                  'pulpLabel':'', 'dualRoot':'false'}[k]
        d[k] = r.group(1).strip('"') if r else defaut
    DIAG[m.group(1)] = d

# ---------- libellés de profondeur ----------
DEPTH = dict(re.findall(r'\n    (\w+):\s*"([^"]*)"', re.search(r'var RADIO_DEPTH_LABELS = \{(.*?)\n  \};', s, re.S).group(1)))

# ---------- profils thérapeutiques ----------
PROF = {}
for m in re.finditer(r'\n    (\w+):\s*\{depth:"(\w+)",\s*apical:\s*(true|false)', re.search(r'var TX_PROFILE = \{(.*?)\n  \};', s, re.S).group(1)):
    PROF[m.group(1)] = (m.group(2), m.group(3) == 'true')

# Précision apicale propre à une pathologie, quand « avec / sans image radioclaire » ne suffit pas.
APICAL_NOTE = dict(re.findall(r'\n    (\w+):\s*\{[^}]*?apicalNote:"([^"]*)"', s, re.S))


# Restauration coronaire attendue au rendez-vous de soins, selon le geste final. Un geste non prévu
# renvoie None : il sera signalé, jamais passé sous silence — un classificateur muet donnerait une
# fausse assurance sur les cas qu'il ne sait pas lire.
RESTAURATION = {
    'endo_complet': 'restauration_definitive',
    'retraitement': 'restauration_definitive',
    'curetage':     'restauration_definitive',   # hyperhémie et pulpite réversible
    'extraction':   'aucune',
    'rien':         'aucune',
}
def restauration_attendue(geste):
    return RESTAURATION.get(geste)

pbs = []
def note(mode, cas, txt):
    pbs.append("[%s] %-28s %s" % (mode, cas, txt))

# --- helpers d'interprétation du texte ---
def dit_apical(t):
    """True = affirme une image apicale, False = la nie, None = muet."""
    tl = t.lower()
    if re.search(r"(sans|aucune|pas de|pas d')\s*(image|lésion|zone|radioclarté)", tl):
        return False
    if re.search(r"(image|zone) radiocl|radioclarté apicale|lésion radioclaire", tl):
        return True
    return None

def dit_ligament_elargi(t):
    return 'ligament' in t.lower() and ('élargi' in t.lower() or 'épaissi' in t.lower())

def dit_tumefaction(t):
    tl = t.lower()
    if re.search(r"(sans|aucune?|ni)\s+(douleur\s+ni\s+)?tuméfaction|pas de tuméfaction|ni tuméfaction", tl):
        return False
    return bool(re.search(r"tuméfaction|gonflement|œdème|oedème", tl))

def dit_collection(t):
    tl = t.lower()
    return bool(re.search(r"godet positif|collection fluctuante|signe du godet \(positif\)", tl))

def dit_fistule(t):
    tl = t.lower()
    return bool(re.search(r"petit bouton|fistule|parulie", tl))

def dit_generaux(t):
    tl = t.lower()
    return bool(re.search(r"fièvre|dysphagie|trismus|s'étendant vers le cou", tl))

# =============================================================================
#  MODE DIAGNOSTIC : fiche de correction
# =============================================================================
dbloc = s[s.index('var DIAGNOSES = {'):s.index('\n  };', s.index('var DIAGNOSES = {'))]
for m in re.finditer(r'\n    (\w+): \{(.*?)(?=\n    \w+: \{|\Z)', dbloc, re.S):
    did, corps = m.group(1), m.group(2)
    if did not in DIAG: continue
    g = DIAG[did]
    titre = re.search(r'title:"([^"]*)"', corps).group(1)
    radios = [re.search(r'\n        radio:"([^"]*)"', corps)]
    radios = [r.group(1) for r in radios if r]
    radios += re.findall(r'radio: "([^"]*)"', corps)          # variantes
    radios += re.findall(r'"(Perte de substance[^"]*|Restauration[^"]*|Délabrement[^"]*)"', corps)
    signes = " ".join(re.findall(r'\n        "([^"]*)",?', corps))
    for rt in set(radios):
        a = dit_apical(rt)
        if a is True and g['periapical'] in ('none',):
            note('diagnostic', titre, "radio affirme une image apicale, schéma periapical=none\n        → " + rt[:90])
        if a is False and g['periapical'] in ('defined', 'diffuse'):
            note('diagnostic', titre, "radio nie l'image apicale, schéma periapical=%s\n        → %s" % (g['periapical'], rt[:90]))
    # fistule
    if dit_fistule(signes + " " + corps) != (g['fistula'] == 'true'):
        note('diagnostic', titre, "fistule : texte=%s schéma=%s" % (dit_fistule(signes), g['fistula']))

    # vitalité pulpaire : un froid négatif impose une pulpe nécrosée au schéma, et réciproquement
    froid = re.search(r'answers:\{[^}]*froid:"(\w+)"', corps)
    froid = froid.group(1) if froid else ('non' if 'froid:' not in corps else None)
    necrosee = 'nécros' in g['pulpLabel'].lower()
    if froid == 'non' and not necrosee:
        note('diagnostic', titre, "test au froid négatif mais pulpe non nécrosée au schéma (%s)" % g['pulpLabel'])
    if froid and froid != 'non' and necrosee:
        note('diagnostic', titre, "test au froid positif (%s) mais pulpe nécrosée au schéma" % froid)

    # tuméfaction et collection : ce que le patient répond doit se voir sur le schéma
    q_gonf = re.search(r'\n        gonflement:"([^"]*)"', corps)
    if q_gonf:
        oui = not q_gonf.group(1).lower().startswith('non')
        if oui and g['swelling'] == 'none':
            note('diagnostic', titre, "le patient décrit un gonflement, schéma sans tuméfaction")
        if not oui and g['swelling'] != 'none':
            note('diagnostic', titre, "schéma avec tuméfaction (%s) mais patient sans gonflement" % g['swelling'])
    q_godet = re.search(r'\n        godet:"([^"]*)"', corps)
    if q_godet:
        oui = not q_godet.group(1).lower().startswith('non')
        if oui and g['swelling'] not in ('collected', 'severe'):
            note('diagnostic', titre, "godet positif mais schéma swelling=%s" % g['swelling'])

# =============================================================================
#  MODE CHOIX THÉRAPEUTIQUE
# =============================================================================
tb = s[s.index('var TX_MULTISTEP_CASES = {'):s.index('\n  var TX_RECAP_TYPES')]
bornes = sorted({m.group(1): m.start() for m in re.finditer(r'\n    (\w+): \[', tb)}.items(), key=lambda x: x[1]) + [('FIN', len(tb))]
vus = set()
for i in range(len(bornes) - 1):
    path, d = bornes[i]
    vus.add(path)
    g = DIAG.get(path)
    if not g: continue
    for v in re.split(r'\n      \{', tb[d:bornes[i+1][1]])[1:]:
        pl = re.search(r'patientLine: "(.*?)",\n', v, re.S)
        if not pl: continue
        pl = pl.group(1)
        pren = pl.split(',')[0]
        rtm = re.search(r'radioText: "(.*?)",\n', v, re.S)
        if rtm:
            rt = rtm.group(1)
        else:
            dp = re.search(r'depth: "(\w+)"', v); ap = re.search(r'apical: (true|false)', v)
            depth = dp.group(1) if dp else PROF.get(path, ('coronaire', False))[0]
            apical = (ap.group(1) == 'true') if ap else PROF.get(path, ('coronaire', False))[1]
            note_ap = APICAL_NOTE.get(path)
            rt = DEPTH.get(depth, '?') + ', ' + (note_ap if note_ap else
                 ('avec une image radioclaire apicale' if apical else 'sans image radioclaire apicale')) + '.'
        cas = "%s (%s)" % (pren, path)

        # 1. image apicale : radiographie contre schéma
        a = dit_apical(rt)
        if a is True and g['periapical'] == 'none':
            note('thérapeutique', cas, "radio affirme une image apicale, schéma periapical=none")
        if a is False and g['periapical'] in ('defined', 'diffuse'):
            note('thérapeutique', cas, "radio nie l'image apicale, schéma periapical=%s\n        → %s" % (g['periapical'], rt[:95]))

        # 2. tuméfaction : énoncé contre schéma
        t = dit_tumefaction(pl)
        if t and g['swelling'] == 'none':
            note('thérapeutique', cas, "énoncé décrit une tuméfaction, schéma swelling=none")
        if not t and g['swelling'] != 'none':
            note('thérapeutique', cas, "schéma swelling=%s mais énoncé sans tuméfaction" % g['swelling'])

        # 3. collection (godet) : réservée aux schémas collected/severe
        if dit_collection(pl) and g['swelling'] not in ('collected', 'severe'):
            note('thérapeutique', cas, "énoncé décrit une collection (godet), schéma swelling=%s" % g['swelling'])

        # 4. fistule
        if dit_fistule(pl) != (g['fistula'] == 'true'):
            note('thérapeutique', cas, "fistule : énoncé=%s schéma=%s" % (dit_fistule(pl), g['fistula']))

        # 5. signes généraux : uniquement la cellulite diffuse
        if dit_generaux(pl) and g['swelling'] != 'severe':
            note('thérapeutique', cas, "énoncé décrit des signes généraux, schéma swelling=%s" % g['swelling'])

        # 6. fracture du plancher : elle exige le schéma dédié à deux racines, aucun autre
        #    tracé ne sait montrer la furcation, sa perte osseuse et la gencive qui l'a comblée.
        if 'fracture du plancher' in rt.lower() and "diagram: 'floor_fracture'" not in v:
            note('thérapeutique', cas, "radio décrit une fracture du plancher sans le schéma dédié")
        if "diagram: 'floor_fracture'" in v and 'fracture du plancher' not in rt.lower():
            note('thérapeutique', cas, "schéma de fracture du plancher sans radio correspondante")

        # 7. cohérence énoncé / radiographie sur l'état coronaire
        etats = {
            'obturation réinfiltrée': 'étanchéité' in rt.lower(),
            'couronne prothétique':   'inlay-core' in rt.lower(),
            'fracture coronaire':     'fracture coronaire' in rt.lower(),
            'restauration récente':   'restauration récente' in rt.lower(),
        }
        for nom, dans_radio in etats.items():
            if not dans_radio: continue
            cle = {'obturation réinfiltrée':'restauration|obturation coronaire|soin',
                   'couronne prothétique':'couronne',
                   'fracture coronaire':'fracture',
                   'restauration récente':'restauration'}[nom]
            if not re.search(cle, pl, re.I):
                note('thérapeutique', cas, "radio décrit « %s » mais l'énoncé n'en parle pas" % nom)

# =============================================================================
#  CONTRÔLES SUPPLÉMENTAIRES
# =============================================================================
NIVEAUX = {'sain':0, 'carie_legere':1, 'coronaire':2, 'supra_gingival':3,
           'juxta_gingival':4, 'infra_gingival':5, 'infra_osseux':6}
MOTS = {'supra-gingival':'supra_gingival', 'juxta-gingival':'juxta_gingival',
        'infra-gingival':'infra_gingival', 'infra-osseux':'infra_osseux',
        'infra-osseuse':'infra_osseux', 'sous la crête osseuse':'infra_osseux'}

def profondeur_citee(t):
    """Profondeur explicitement nommée dans un texte, ou None."""
    tl = t.lower()
    trouve = [n for mot, n in MOTS.items() if mot in tl]
    return trouve[0] if len(set(trouve)) == 1 else None

for i in range(len(bornes) - 1):
    path, d = bornes[i]
    g = DIAG.get(path)
    if not g: continue
    for v in re.split(r'\n      \{', tb[d:bornes[i+1][1]])[1:]:
        plm = re.search(r'patientLine: "(.*?)",\n', v, re.S)
        if not plm: continue
        pl = plm.group(1); pren = pl.split(',')[0]
        cas = "%s (%s)" % (pren, path)
        rtm = re.search(r'radioText: "(.*?)",\n', v, re.S)
        if rtm:
            rt = rtm.group(1)
        else:
            # Même reconstitution que dans la première boucle : sans elle, tous les cas dépourvus
            # de texte explicite échappaient silencieusement aux contrôles ci-dessous.
            dp = re.search(r'depth: "(\w+)"', v); ap = re.search(r'apical: (true|false)', v)
            depth = dp.group(1) if dp else PROF.get(path, ('coronaire', False))[0]
            apical = (ap.group(1) == 'true') if ap else PROF.get(path, ('coronaire', False))[1]
            note_ap = APICAL_NOTE.get(path)
            rt = DEPTH.get(depth, '?') + ', ' + (note_ap if note_ap else
                 ('avec une image radioclaire apicale' if apical else 'sans image radioclaire apicale')) + '.'
        txt = v.replace(' ', '')

        # A0. état périapical : ce que la radiographie décrit doit être ce que le schéma dessine.
        #     Trois états sont possibles — ligament sain, ligament élargi, lésion constituée — et
        #     le texte les distingue explicitement. « Discrète image radioclaire » est volontairement
        #     rattachée au ligament élargi : le schéma y dessine un petit foyer diffus, ce qui la
        #     represente mieux que la lésion large et bien délimitée.
        def classe_apicale(t):
            tl = t.lower()
            if re.search(r"ligament[^.;]*(d\'aspect sain|sans épaississement)", tl): return 'none'
            if 'discrète image radiocl' in tl or 'discrete image radiocl' in tl: return 'widened'
            if re.search(r"(image|zone) radiocl|radioclarté apicale|lésion radioclaire (bien|apicale)", tl) \
               and not re.search(r"(sans|aucune|pas de) (image|lésion|zone|radioclarté)", tl): return 'defined'
            if re.search(r"ligament[^.;]*(élargi|épaissi)", tl): return 'widened'
            if re.search(r"(sans|aucune|pas de) (image|lésion|zone|radioclarté)", tl): return 'none'
            return None

        ov = re.search(r"periapical: \'(\w+)\'", v)
        attendu = ov.group(1) if ov else g['periapical']
        ca = classe_apicale(rt if rt else '')
        # Une formulation non reconnue est SIGNALÉE, jamais ignorée : un classificateur muet
        # laisse passer les contradictions qu'il ne sait pas lire, et donne une fausse assurance.
        if rt and ca is None:
            note('thérapeutique', cas, "description apicale non reconnue par l'audit — à classer\n        → " + rt[:95])
        if ca and ca != attendu:
            note('thérapeutique', cas, "apex : texte « %s », schéma « %s »\n        → %s" % (ca, attendu, (rt or '')[:95]))

        # A1. Pulpite aiguë irréversible : le geste coronaire se déduit de DEUX axes, l'âge et
        #     l'hémostase. Moins de 30 ans et saignement facilement contrôlé -> pulpotomie
        #     thérapeutique seule ; saignement impossible à stabiliser -> pulpectomie d'urgence à
        #     tout âge ; tout le reste -> pulpotomie d'urgence, associée au curetage carieux et à
        #     une restauration transitoire étanche. Au-delà de 30 ans, la cicatrisation de la pulpe
        #     radiculaire ne permet plus de la conserver, même si le saignement est facile.
        if path == 'irreversible':
            age = re.search(r'patientLine: "[^,]+, (\d+) ans', v)
            if not age:
                note('thérapeutique', cas, "âge du patient introuvable dans l'énoncé")
            else:
                a = int(age.group(1))
                pll = pl.lower()
                if re.search(r"impossible à stabiliser|reprend systématiquement|très abondant et persistant", pll):
                    hemo = 'difficile'
                elif re.search(r"assez important|initialement important|difficile à stabiliser", pll):
                    hemo = 'important'
                elif re.search(r"discret|facilement contrôlable|rapidement contrôlable|contrôlable en quelques minutes", pll):
                    hemo = 'facile'
                else:
                    hemo = None
                    note('thérapeutique', cas, "hémostase non reconnue par l'audit — à classer")
                if hemo:
                    if hemo == 'difficile':
                        att = "curetage,pulpectomie_urgence,reconstitution_provisoire"
                    elif a < 30 and hemo == 'facile':
                        att = "curetage,pulpotomie_therapeutique,reconstitution_definitive"
                    else:
                        att = "curetage,pulpotomie_urgence,reconstitution_provisoire"
                    ax = re.search(r"coronaire:\[([^\]]*)\]", v)
                    reel = ax.group(1).replace("'", "").replace(" ", "") if ax else '?'
                    if reel != att:
                        note('thérapeutique', cas,
                             "%d ans + hémostase %s -> attendu « %s », corrigé « %s »" % (a, hemo, att, reel))

        # A2. Dent porteuse d'une couronne scellée sur inlay-core : aucun geste coronaire à
        #     l'urgence. Il n'y a ni lésion carieuse à cureter ni restauration à refaire, et déposer
        #     une couronne intacte n'apporterait rien à ce stade — l'accès au canal se fera au
        #     retraitement, à travers elle.
        if "coronal: 'crown_inlay'" in v:
            ax = re.search(r"coronaire:\[([^\]]*)\]", v)
            reel = ax.group(1).replace("'", "").replace(" ", "") if ax else '?'
            if reel != 'aucun':
                note('thérapeutique', cas,
                     "dent couronnée mais geste coronaire attendu « %s » (doit être « aucun »)" % reel)

        # A. profondeur : l'énoncé et la radiographie doivent nommer la même
        if rt:
            pe, pr = profondeur_citee(pl), profondeur_citee(rt)
            if pe and pr and pe != pr:
                note('thérapeutique', cas, "énoncé dit « %s », radiographie dit « %s »" % (pe, pr))

        # B. conservabilité annoncée contre acte attendu
        dit_non = bool(re.search(r"non conservable|n'est pas conservable|pas conservable", (pl + ' ' + rt).lower()))
        dit_oui = (not dit_non) and 'conservable' in (pl + ' ' + rt).lower()
        extraction = "'extraction'" in txt
        referer = "'referer'" in txt
        if dit_non and not (extraction or referer):
            note('thérapeutique', cas, "texte : dent NON conservable, mais aucun acte d'extraction attendu")
        if dit_oui and extraction:
            note('thérapeutique', cas, "texte : dent conservable, mais extraction attendue")


        # C. restauration coronaire du traitement final. Une dent traitée ou retraitée doit toujours
        #    être reconstituée — c'est cette reconstitution, davantage que le traitement canalaire,
        #    qui décide de sa survie à long terme. Une dent extraite n'a rien à reconstituer, une
        #    dent saine non plus.
        if re.search(r"finalAxes:\s*\{", v):
            fa = re.search(r"finalAxes:\s*\{geste:\['(\w+)'\],\s*coronaire:\[([^\]]*)\]", v)
            if not fa:
                note('thérapeutique', cas,
                     "traitement final sans restauration coronaire déclarée : elle ne serait jamais corrigée")
            else:
                geste = fa.group(1)
                reel = fa.group(2).replace("'", "").replace(" ", "")
                att = restauration_attendue(geste)
                if att is None:
                    note('thérapeutique', cas,
                         "geste final « %s » inconnu de la règle de restauration" % geste)
                elif reel != att:
                    note('thérapeutique', cas,
                         "geste final « %s » -> restauration attendue « %s », corrigé « %s »" % (geste, att, reel))

        # Note : on ne contrôle PAS ici « pulpe nécrosée contre geste pulpaire ». « Pulpectomie
        # d'urgence » désigne, dans la nomenclature de l'application, le parage canalaire réalisé
        # sur une dent nécrosée — ce n'est pas une contradiction.


# =============================================================================
#  FICHE RÉCAPITULATIVE : même règle de restauration que les cas joués
# =============================================================================
# Le récapitulatif imprimable est ce que l'étudiant relit chez lui : une ligne qui contredirait le
# corrigé y enseignerait durablement l'inverse de l'application.
rb = s[s.index('var TX_RECAP_TYPES'):s.index('\n  };', s.index('var TX_RECAP_TYPES'))]
lignes = 0
for m in re.finditer(r"finalAxes:\{geste:\['(\w+)'\],\s*coronaire:\[([^\]]*)\]", rb):
    lignes += 1
    geste, reel = m.group(1), m.group(2).replace("'", "").replace(" ", "")
    att = restauration_attendue(geste)
    if att is None:
        note('récapitulatif', geste, "geste final inconnu de la règle de restauration")
    elif reel != att:
        note('récapitulatif', geste, "restauration attendue « %s », fiche « %s »" % (att, reel))
# Une ligne à traitement final qui n'aurait pas de restauration déclarée échapperait à tout contrôle.
declares = len(re.findall(r"finalAxes:\{geste:", rb))
if declares != lignes:
    note('récapitulatif', '-', "%d ligne(s) de traitement final sans restauration coronaire" % (declares - lignes))

print("Lignes de récapitulatif auditées : %d" % lignes)

print("Pathologies thérapeutiques auditées : %d" % len(vus))
print("\nAnomalies : %d" % len(pbs))
for p in pbs: print("  ! " + p)
sys.exit(1 if pbs else 0)

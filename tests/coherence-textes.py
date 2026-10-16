#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cohérence entre l'énoncé clinique, le texte radiographique et le schéma.

Contrairement aux autres suites, celle-ci n'ouvre pas de navigateur : elle lit directement
index.html et parcourt EXHAUSTIVEMENT tous les cas des deux modes. C'est délibéré — un test
qui tire des cas au hasard finit toujours par en manquer, et un cas jamais tiré n'est pas un
cas vérifié.

Ce qu'elle contrôle, cas par cas :
  - le texte radiographique affirme une image apicale <-> le schéma en dessine une ;
  - l'énoncé décrit une tuméfaction, une collection (reflux), une fistule ou des signes
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


# Restauration coronaire attendue au rendez-vous de soins. Elle ne se déduit pas du seul geste
# final : une pulpite réversible n'a plus rien à faire sur la dent ce jour-là — le curetage a été
# réalisé à l'urgence — et doit pourtant être restaurée définitivement. La règle porte donc sur ce
# qui a été fait à la dent en tout, urgence comprise :
#   dent extraite            -> rien à reconstituer ;
#   dent à laquelle on n'a jamais touché (saine) -> rien à reconstituer ;
#   dans tous les autres cas -> restauration définitive.
GESTES_FINAUX = {'endo_complet', 'retraitement', 'curetage', 'extraction', 'rien'}

def restauration_attendue(geste_final, coronaire_urgence):
    """None pour un geste non prévu : il sera signalé, jamais passé sous silence — un
    classificateur muet donnerait une fausse assurance sur les cas qu'il ne sait pas lire."""
    if geste_final not in GESTES_FINAUX:
        return None
    if geste_final == 'extraction':
        return 'aucune'
    if geste_final == 'rien' and coronaire_urgence == 'aucun':
        return 'aucune'
    return 'restauration_definitive'

# Les deux formules qui séparent l'hyperhémie de la pulpite réversible. Elles servent aussi bien
# aux énoncés des cas qu'aux justifications affichées après coup : partout où l'une des deux
# pathologies est décrite, elle doit l'être dans ses propres termes.
CESSE_AUSSITOT = r"dès (l'arrêt|que le stimulus|qu'on retire|l'application)|immédiatement après|immédiatement à l'arrêt|aussitôt"
QUELQUES_SEC   = r"quelques secondes"

pbs = []
def note(mode, cas, txt):
    pbs.append("[%s] %-28s %s" % (mode, cas, txt))

# --- helpers d'interprétation du texte ---
def dit_apical(t):
    """True = affirme une image apicale, False = la nie, None = muet.

    La négation se dit de plusieurs façons, et une seule oubliée suffit à faire lire un démenti
    comme une affirmation. « Sans épaississement NI lésion radioclaire » ne commence pas par
    « sans lésion » — le motif d'origine ne le voyait pas et concluait à une image apicale.
    """
    tl = t.lower()
    if re.search(r"(sans|aucune?|pas de|pas d'|ni)\s+(image|lésion|zone|radioclarté)", tl):
        return False
    if re.search(r"(image|zone) radiocl|radioclarté apicale|lésion radioclaire", tl):
        return True
    return None

def classe_apicale(t):
    tl = t.lower()
    if re.search(r"ligament[^.;]*(d\'aspect sain|sans épaississement)", tl): return 'none'
    if 'discrète image radiocl' in tl or 'discrete image radiocl' in tl: return 'widened'
    # « zone DE radioclarté bien délimitée à l'apex » ne commençait par aucun des motifs prévus :
    # le classificateur se taisait, et le mode Diagnostic signalait l'abcès apical aigu comme
    # non classable. Un silence vaut mieux qu'une erreur, mais un motif complet vaut mieux encore.
    if re.search(r"(image|zone) (de )?radiocl|radioclarté[^.;]*(apicale|à l'apex)|lésion radioclaire (bien|apicale)", tl) \
       and not re.search(r"(sans|aucune|pas de) (image|lésion|zone|radioclarté)", tl): return 'defined'
    if re.search(r"ligament[^.;]*(élargi|épaissi)", tl): return 'widened'
    if re.search(r"(sans|aucune|pas de) (image|lésion|zone|radioclarté)", tl): return 'none'
    return None

def dit_ligament_elargi(t):
    return 'ligament' in t.lower() and ('élargi' in t.lower() or 'épaissi' in t.lower())

def dit_tumefaction(t):
    tl = t.lower()
    if re.search(r"(sans|aucune?|ni)\s+(douleur\s+ni\s+)?tuméfaction|pas de tuméfaction|ni tuméfaction", tl):
        return False
    return bool(re.search(r"tuméfaction|gonflement|œdème|oedème", tl))

def dit_collection(t):
    """Ce qui signe une collection constituée, c'est le REFLUX purulent — pas le godet.
    Le godet se creuse dans un œdème d'infiltration (cellulite séreuse, cellulite diffuse) ; une
    collection sous tension, elle, ne le prend pas. Confondre les deux, comme le faisait la version
    précédente de ce détecteur, revient à annoncer une collection là où il n'y en a pas."""
    tl = t.lower()
    # Une collection fluctuante est affirmée en tant que telle : rien ne la nie ensuite.
    if 'collection fluctuante' in tl:
        return True
    # « sans reflux purulent » écarte au contraire la collection. Sans ce garde-fou, la mention même
    # du mot suffisait à conclure — et les énoncés de cellulite séreuse, qui NIENT le reflux, étaient
    # lus comme s'ils l'affirmaient.
    if re.search(r"sans (aucun )?reflux|pas de reflux|reflux négatif", tl):
        return False
    return bool(re.search(r"reflux purulent|signe du reflux", tl))

def dit_godet(t):
    tl = t.lower()
    if re.search(r"sans (signe de |signe du )?godet|ne prenant pas le godet|godet négatif", tl):
        return False
    return bool(re.search(r"godet", tl))

def restauration_etanche(t):
    """Restauration récente : étanche et sans reprise carieuse. Rien à cureter."""
    return bool(re.search(r"restauration récente|soin récent", t, re.I)) \
       and not re.search(r"perdu son étanchéité|infiltrée|réinfiltrée", t, re.I)

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
        # Les trois états — ligament sain, ligament élargi, lésion constituée — sont contrôlés ici
        # comme ils le sont pour le mode thérapeutique. La version qui précédait ne distinguait que
        # « lésion » de « pas de lésion » : un schéma dessinant un ligament élargi sous un texte qui
        # affirme un apex sain passait inaperçu, et c'est exactement ce qui était en ligne pour la
        # nécrose pulpaire.
        ca = classe_apicale(rt)
        if ca is None:
            note('diagnostic', titre, "description apicale non reconnue par l'audit — à classer\n        → " + rt[:90])
        elif ca != g['periapical']:
            note('diagnostic', titre, "apex : texte « %s », schéma « %s »\n        → %s" % (ca, g['periapical'], rt[:90]))
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
    # Le reflux purulent signe la collection : lui seul doit correspondre à un schéma collecté.
    q_reflux = re.search(r'\n        reflux:"([^"]*)"', corps)
    if q_reflux:
        oui = not q_reflux.group(1).lower().startswith('non')
        if oui and g['swelling'] not in ('collected', 'severe'):
            note('diagnostic', titre, "reflux positif mais schéma swelling=%s" % g['swelling'])
        if not oui and g['swelling'] == 'collected':
            note('diagnostic', titre, "schéma collecté mais réponse « pas de reflux »")
    else:
        note('diagnostic', titre, "aucune réponse au signe du reflux : la question resterait sans corrigé")
    # Godet et reflux s'excluent : un œdème qui se creuse n'est pas une collection sous tension.
    q_godet = re.search(r'\n        godet:"([^"]*)"', corps)
    if q_godet and q_reflux:
        g_oui = not q_godet.group(1).lower().startswith('non')
        r_oui = not q_reflux.group(1).lower().startswith('non')
        if g_oui and r_oui:
            note('diagnostic', titre, "godet ET reflux positifs : une collection sous tension ne prend pas le godet")

# -----------------------------------------------------------------------------
#  Le test au froid : aucun diagnostic ne doit rester sans réponse
# -----------------------------------------------------------------------------
# La réponse au froid est structurée — normal, quasi_normal, quelques_secondes, intense, non — et
# c'est elle qui sert à la correction et au différentiel. Une valeur absente vaut « non » : c'est
# le défaut que signValue() applique dans l'application, et le reproduire ici est indispensable,
# sans quoi les six diagnostics à pulpe nécrosée, qui ne déclarent rien, seraient signalés à tort.
#
# Ce qui n'est PAS contrôlé, délibérément : que deux diagnostics partageant la même valeur la
# formulent dans les mêmes termes. C'est le cas de la pulpite irréversible et du syndrome mixte,
# tous deux en « intense », dont les citations diffèrent — « se prolongeant jusqu'à l'oreille »
# contre « pas extrêmement intense ». L'enseignante a choisi de conserver cette nuance clinique.
# La conséquence est connue et assumée : sur ces deux-là, les mots en disent un peu plus que la
# valeur classée, et le différentiel tient le froid pour non discriminant. L'écrire ici évite de
# redécouvrir le point comme s'il s'agissait d'un oubli.
froids = {}
for m in re.finditer(r'\n    (\w+): \{(.*?)(?=\n    \w+: \{|\Z)', dbloc, re.S):
    corps = m.group(2)
    t = re.search(r'title:"([^"]*)"', corps)
    if not t:
        continue
    val = re.search(r'answers:\{[^\n]*?froid:"(\w+)"', corps)
    cite = re.search(r'\n        froid:"([^"]*)"', corps)
    if not cite:
        note('diagnostic', t.group(1), "aucune citation pour le test au froid : le patient ne répondrait rien")
        continue
    froids.setdefault(val.group(1) if val else 'non', []).append(t.group(1))

print("Valeurs du test au froid auditées : %d" % len(froids))

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

        # 1. image apicale : radiographie contre schéma. Le cas peut surcharger l'état périapical
        #    du schéma de sa pathologie ; lire le défaut sans tenir compte de la surcharge revient à
        #    juger un dessin que l'étudiant ne verra jamais.
        ap_case = re.search(r"periapical: '(\w+)'", v)
        peri = ap_case.group(1) if ap_case else g['periapical']
        a = dit_apical(rt)
        if a is True and peri == 'none':
            note('thérapeutique', cas, "radio affirme une image apicale, schéma periapical=none")
        if a is False and peri in ('defined', 'diffuse'):
            note('thérapeutique', cas, "radio nie l'image apicale, schéma periapical=%s\n        → %s" % (peri, rt[:95]))

        # 2. tuméfaction : énoncé contre schéma
        t = dit_tumefaction(pl)
        if t and g['swelling'] == 'none':
            note('thérapeutique', cas, "énoncé décrit une tuméfaction, schéma swelling=none")
        if not t and g['swelling'] != 'none':
            note('thérapeutique', cas, "schéma swelling=%s mais énoncé sans tuméfaction" % g['swelling'])

        # 3. collection (reflux purulent) : réservée aux schémas collected/severe
        if dit_collection(pl) and g['swelling'] not in ('collected', 'severe'):
            note('thérapeutique', cas, "énoncé décrit une collection (reflux), schéma swelling=%s" % g['swelling'])

        # 3bis. godet et reflux ne peuvent pas être positifs ensemble dans un même énoncé.
        if dit_godet(pl) and dit_collection(pl):
            note('thérapeutique', cas, "énoncé annonce à la fois le godet et une collection qui reflue")

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
        # classe_apicale est définie au niveau du fichier : le mode Diagnostic l'utilise aussi.

        ov = re.search(r"periapical: \'(\w+)\'", v)
        attendu = ov.group(1) if ov else g['periapical']
        ca = classe_apicale(rt if rt else '')
        # Une formulation non reconnue est SIGNALÉE, jamais ignorée : un classificateur muet
        # laisse passer les contradictions qu'il ne sait pas lire, et donne une fausse assurance.
        if rt and ca is None:
            note('thérapeutique', cas, "description apicale non reconnue par l'audit — à classer\n        → " + rt[:95])
        if ca and ca != attendu:
            note('thérapeutique', cas, "apex : texte « %s », schéma « %s »\n        → %s" % (ca, attendu, (rt or '')[:95]))

        # A0bis. Ce qui accompagne obligatoirement une extraction.
        #
        #   - Le granulome ou le kyste apical ne part pas avec la dent : si on ne le curette pas,
        #     il reste dans l'os et donne un kyste résiduel. Toute extraction d'une dent portant une
        #     radioclarté constituée appelle donc son curetage. Une dent conservée, elle, n'en relève
        #     pas : sa lésion guérit après le traitement endodontique, et la cureter serait de la
        #     chirurgie apicale, pas un geste d'urgence.
        #   - Une fistule doit être nettoyée même quand la dent part : le trajet fistuleux ne se
        #     draine pas tout seul.
        chir = re.search(r"chirurgical:\[([^\]]*)\]", v)
        chir = chir.group(1).replace("'", "").replace(" ", "") if chir else ''
        extrait = 'extraction' in chir

        if extrait and ca == 'defined' and 'curetage_granulome' not in chir:
            note('thérapeutique', cas,
                 "extraction d'une dent portant une radioclarté constituée, sans curetage du tissu "
                 "granuleux — corrigé « %s »" % chir)
        if not extrait and 'curetage_granulome' in chir:
            note('thérapeutique', cas,
                 "curetage du tissu granuleux attendu sans extraction : sur une dent conservée, la lésion "
                 "guérit après le traitement endodontique")
        # Et réciproquement : sans radioclarté constituée, il n'y a aucun granulome à cureter. Sans
        # cette moitié de règle, on pourrait en ajouter un là où il n'y a rien, sans que rien ne le
        # signale — c'est le cas de la parodontite apicale aiguë, ligament élargi mais lésion absente.
        if extrait and ca != 'defined' and 'curetage_granulome' in chir:
            note('thérapeutique', cas,
                 "curetage du tissu granuleux attendu alors que la radiographie ne décrit aucune lésion "
                 "constituée (apex classé « %s »)" % ca)
        if extrait and dit_fistule(pl) and 'drainage_fistulaire' not in chir:
            note('thérapeutique', cas,
                 "l'énoncé décrit une fistule et la dent est extraite, mais aucun drainage "
                 "fistulaire n'est attendu — corrigé « %s »" % chir)

        # A0ter. Hyperhémie et pulpite réversible ne se séparent que sur UN point : la durée de la
        #        douleur après le retrait du froid. L'hyperhémie cesse dès le retrait ; la pulpite
        #        réversible est vive sur le moment et régresse en quelques secondes. Un énoncé qui
        #        emprunte la formule de l'autre enseigne exactement l'inverse du différentiel — et
        #        c'est arrivé deux fois, sur Sophie et sur Lucas, sans que rien ne le signale.
        if path == 'reversible' and re.search(CESSE_AUSSITOT, pl) and not re.search(QUELQUES_SEC, pl):
            note('thérapeutique', cas,
                 "énoncé de pulpite réversible décrivant une douleur qui cesse dès le retrait du "
                 "stimulus : c'est la formule de l'hyperhémie")
        if path == 'hyperhemie' and re.search(QUELQUES_SEC, pl):
            note('thérapeutique', cas,
                 "énoncé d'hyperhémie décrivant une douleur qui dure quelques secondes : c'est la "
                 "formule de la pulpite réversible")

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
                    # Le curetage carieux ne fait partie de la réponse que s'il y a une carie. Sous
                    # une restauration récente — étanche, sans reprise carieuse — il n'y a rien à
                    # cureter : seul le geste pulpaire et la reconstitution demeurent.
                    cur = "" if restauration_etanche(pl + ' ' + rt) else "curetage,"
                    if hemo == 'difficile':
                        att = cur + "pulpectomie_urgence,reconstitution_provisoire"
                    elif a < 30 and hemo == 'facile':
                        att = cur + "pulpotomie_therapeutique,reconstitution_definitive"
                    else:
                        att = cur + "pulpotomie_urgence,reconstitution_provisoire"
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

        # A3. Restauration récente, donc étanche et sans reprise carieuse. Il n'y a alors rien à
        #     cureter — aucune carie — et rien à reconstituer — l'étanchéité coronaire est déjà
        #     assurée : ouvrir la dent n'exposerait le système canalaire sans aucun bénéfice.
        #
        #     La règle vaut pour TOUS les cas, y compris ceux où la dent est ouverte pour un geste
        #     pulpaire : ouvrir la chambre n'est pas cureter une carie, et l'énoncé dit lui-même
        #     « sans reprise carieuse ». Ce qui change alors, c'est seulement la reconstitution :
        #     une dent ouverte doit être refermée, une dent non ouverte n'a rien à recevoir.
        etanche = restauration_etanche(pl + ' ' + rt)
        geste_pulpaire = re.search(r"pulpotomie|pulpectomie", v)
        ax = re.search(r"coronaire:\[([^\]]*)\]", v)
        reel = ax.group(1).replace("'", "").replace(" ", "") if ax else '?'
        if etanche:
            # Aucune carie sous une restauration étanche : le curetage n'a jamais lieu d'être, que
            # l'on ouvre la dent pour un geste pulpaire ou non.
            if 'curetage' in reel:
                note('thérapeutique', cas,
                     "restauration récente (étanche, sans reprise carieuse) mais curetage attendu : "
                     "il n'y a pas de carie à cureter — corrigé « %s »" % reel)
            # Et si en plus aucun geste pulpaire n'est réalisé, il n'y a rien non plus à reconstituer :
            # l'étanchéité coronaire est déjà assurée.
            if not geste_pulpaire and reel != 'aucun':
                note('thérapeutique', cas,
                     "restauration récente (étanche) et aucun geste pulpaire, mais geste coronaire "
                     "attendu « %s » (doit être « aucun » : rien à cureter, rien à reconstituer)" % reel)

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
                axu = re.search(r"coronaire:\[([^\]]*)\]", v)
                urg = axu.group(1).replace("'", "").replace(" ", "") if axu else '?'
                att = restauration_attendue(geste, urg)
                if att is None:
                    note('thérapeutique', cas,
                         "geste final « %s » inconnu de la règle de restauration" % geste)
                elif reel != att:
                    note('thérapeutique', cas,
                         "geste final « %s » -> restauration attendue « %s », corrigé « %s »" % (geste, att, reel))

        # Note : on ne contrôle PAS ici « pulpe nécrosée contre geste pulpaire ». « Pulpectomie
        # d'urgence » désigne, dans la nomenclature de l'application, le parage canalaire réalisé
        # sur une dent nécrosée — ce n'est pas une contradiction.


# -----------------------------------------------------------------------------
#  Les justifications affichées après un cas
# -----------------------------------------------------------------------------
# Elles échappaient à tout contrôle, et c'est par elles que l'erreur est revenue : celle de la
# pulpite réversible affirmait que « la douleur au froid ou au sucré cesse dès l'arrêt du
# stimulus » — mot pour mot le tableau de l'hyperhémie, et l'inverse du différentiel que
# l'application affiche par ailleurs. L'étudiant qui se trompe lit cette justification : elle doit
# dire la même chose que tout le reste.
rat = s[s.index('var TX_RATIONALE'):s.index('\n  };', s.index('var TX_RATIONALE'))]
for nom, interdit, pourquoi in [
        ('reversible', CESSE_AUSSITOT, "la douleur y est vive puis s'arrête en quelques secondes"),
        ('hyperhemie', QUELQUES_SEC,   "la douleur y s'arrête immédiatement")]:
    m = re.search(r'\n    %s: "([^"]*)"' % nom, rat)
    if not m:
        note('justification', nom, "justification introuvable : elle ne serait jamais relue")
        continue
    if re.search(interdit, m.group(1)):
        note('justification', nom,
             "la justification emprunte la formule de l'autre tableau — %s" % pourquoi)

print("Justifications auditées : 2")

# =============================================================================
#  FICHE RÉCAPITULATIVE : même règle de restauration que les cas joués
# =============================================================================
# Le récapitulatif imprimable est ce que l'étudiant relit chez lui : une ligne qui contredirait le
# corrigé y enseignerait durablement l'inverse de l'application.
rb = s[s.index('var TX_RECAP_TYPES'):s.index('\n  };', s.index('var TX_RECAP_TYPES'))]
lignes = 0
for m in re.finditer(r"axes:\{coronaire:\[([^\]]*)\].*?finalAxes:\{geste:\['(\w+)'\],\s*coronaire:\[([^\]]*)\]", rb):
    lignes += 1
    urg = m.group(1).replace("'", "").replace(" ", "")
    geste, reel = m.group(2), m.group(3).replace("'", "").replace(" ", "")
    att = restauration_attendue(geste, urg)
    if att is None:
        note('récapitulatif', geste, "geste final inconnu de la règle de restauration")
    elif reel != att:
        note('récapitulatif', geste, "restauration attendue « %s », fiche « %s »" % (att, reel))
# Une ligne à traitement final qui n'aurait pas de restauration déclarée échapperait à tout contrôle.
# La même règle du curetage vaut pour la fiche : une ligne qui annoncerait un curetage sous une
# restauration étanche enseignerait précisément ce que le corrigé vient de corriger.
etancheite = 0
for m in re.finditer(r"\{condition:\"([^\"]*)\", axes:\{coronaire:\[([^\]]*)\]", rb):
    if not restauration_etanche(m.group(1)):
        continue
    etancheite += 1
    if 'curetage' in m.group(2):
        note('récapitulatif', m.group(1)[:40], "curetage annoncé sous une restauration étanche")
print("Lignes « restauration étanche » auditées : %d" % etancheite)

# Le curetage du granulome n'a de sens qu'accompagné d'une extraction : c'est l'alvéole que l'on
# curette. Une ligne qui l'annoncerait sur une dent conservée enseignerait une chirurgie apicale
# d'urgence qui n'existe pas.
for m in re.finditer(r"chirurgical:\[([^\]]*)\]", rb):
    axe = m.group(1).replace("'", "").replace(" ", "")
    if 'curetage_granulome' in axe and 'extraction' not in axe:
        note('récapitulatif', axe, "curetage du tissu granuleux annoncé sans extraction")

declares = len(re.findall(r"finalAxes:\{geste:", rb))
if declares != lignes:
    note('récapitulatif', '-', "%d ligne(s) de traitement final sans restauration coronaire" % (declares - lignes))

print("Lignes de récapitulatif auditées : %d" % lignes)

print("Pathologies thérapeutiques auditées : %d" % len(vus))
print("\nAnomalies : %d" % len(pbs))
for p in pbs: print("  ! " + p)
sys.exit(1 if pbs else 0)

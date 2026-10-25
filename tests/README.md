# Tests

Ces tests vérifient le **corrigé clinique** de l'application : ils rejouent chaque
cas nommé et contrôlent que la bonne réponse est bien acceptée.

À lancer après toute modification des cas, des corrigés ou des règles de notation.

## Prérequis

```bash
npm install -g playwright        # ou : npx playwright install chromium
```

## Lancer les tests

Depuis la racine du dépôt, servir l'application puis exécuter les suites :

```bash
python3 -m http.server 9300 &
node tests/cas-choix-therapeutique.js
node tests/analyse-differentielle.js
node tests/economie-diagnostique.js
node tests/barre-commandes.js
node tests/schemas-soins.js
node tests/legendes-schemas.js
python3 tests/coherence-textes.py
node tests/back-office.js
node tests/confettis.js
node tests/session-unique.js
node tests/lecture-radio.js
```

Résultats attendus :

```
Tested 86 / 86 unique named cases
Missing (never rolled): []
Failures: 0
```

```
Diagnostics rencontres : 12 / 12
Erreurs : 0
```

Les autres suites se terminent par `Erreurs : 0` ou `Problèmes : 0`. `back-office.js`
affiche en plus des tableaux à relire à l'œil — voir plus bas.

## Les onze suites

| Fichier | Ce qu'il vérifie |
|---|---|
| `cas-choix-therapeutique.js` | Le corrigé clinique des 86 cas nommés du mode « Choix thérapeutique », et la fiche récapitulative imprimable |
| `analyse-differentielle.js` | La correction du mode « Diagnostic » : signes discriminants, signe posé ou non |
| `economie-diagnostique.js` | Le rappel à partir de 7 questions et le calcul du rang décisif |
| `barre-commandes.js` | Que les boutons retour / compte / son ne se chevauchent à aucune largeur d'écran |
| `schemas-soins.js` | Que le schéma dessine bien le soin coronaire décrit par l'énoncé |
| `legendes-schemas.js` | Que chaque entrée de légende corresponde au tracé : rien de superflu, rien de manquant |
| `coherence-textes.py` | Que l'énoncé, la radiographie et le schéma disent la même chose — **tous** les cas, sans tirage |
| `back-office.js` | Le back-office enseignant sur une base **simulée** : ventilation par promotion, cas joués et export Excel |
| `confettis.js` | Que les confettis tombent sur un sans-faute, et **seulement** sur un sans-faute |
| `session-unique.js` | Qu'un compte ne reste ouvert que sur un appareil, sans jamais bloquer la révision hors ligne |
| `lecture-radio.js` | Que le troisième mode s'ouvre à tout compte connecté, que l'atelier de tracé et le choix du cliché restent hors de portée des étudiants, que chaque cliché déclaré soit réellement éprouvé, et que la marge de tolérance du pointage fonctionne dans les deux sens |

`analyse-differentielle.js` parcourt les douze diagnostics et contrôle des invariants :
un différentiel affiché sur une erreur et jamais sur une bonne réponse, et surtout un
marquage exact des signes — une question posée ne doit jamais apparaître comme « non
posée », ni l'inverse. Il termine par `Erreurs : 0`.

`barre-commandes.js` mesure les rectangles réellement affichés à sept largeurs d'écran, de
320 à 1440 pixels, et avec un prénom court puis très long. Il vérifie qu'aucune paire de
boutons ne se recouvre, qu'aucun ne sort de l'écran, que la page ne défile pas
latéralement, et que la barre — invisible mais large — n'intercepte pas les clics dans sa
zone vide. Mesurer plutôt qu'inspecter le CSS est délibéré : c'est le rendu qui compte.

`schemas-soins.js` tire des cas de « Choix thérapeutique » jusqu'à couvrir les énoncés
radiographiques distincts, et vérifie pour chacun que le dessin correspond au texte : une
dent déjà traitée porte toujours une obturation coronaire infiltrée — une dent dépulpée en
a forcément une, et c'est sa perte d'étanchéité qui explique la réinfection —, la légende
et le tracé s'accordent, et aucun soin n'est dessiné si l'énoncé n'en mentionne pas.
Il termine par `Erreurs : 0`.

`legendes-schemas.js` enchaîne soixante cas **sans recharger la page** — c'est ainsi qu'une
légende oubliée d'un cas au suivant se révèle, alors qu'un rechargement la masquerait. Il
interroge le **rendu réel** (`getComputedStyle`) et jamais la présence de la classe
`hidden` : c'est précisément une classe `hidden` sans effet, neutralisée par une règle plus
spécifique, qu'il doit attraper. Il compare aussi la couleur de chaque pastille à celle du
tracé correspondant. Il termine par `Erreurs : 0` — la version qui précédait sa création en
signalait 156.

`coherence-textes.py` est la seule suite qui n'ouvre **pas de navigateur** : elle lit
`index.html` et parcourt exhaustivement tous les cas des deux modes. C'est délibéré — un
test qui tire des cas au hasard finit toujours par en manquer, et un cas jamais tiré n'est
pas un cas vérifié. Elle croise, pour chacun : image apicale affirmée par la radiographie
contre lésion dessinée, tuméfaction / collection / fistule / signes généraux décrits par
l'énoncé contre schéma, et état coronaire annoncé par la radiographie contre énoncé.
Elle termine par `Anomalies : 0`.

Elle contrôle aussi l'**état périapical** : ligament sain, ligament élargi ou lésion
constituée, tels que le texte les décrit, contre ce que le schéma dessine. Les trois états sont
vérifiés dans les **deux modes**. Le mode Diagnostic ne distinguait auparavant que « lésion » de
« pas de lésion » : un schéma dessinant un ligament élargi sous un texte affirmant un apex sain y
passait inaperçu, et c'est exactement ce qui était en ligne pour la nécrose pulpaire.

Le contrôle du mode thérapeutique lit la **surcharge propre au cas** quand il y en a une, et non le
seul défaut de sa pathologie — juger le défaut revient à juger un dessin que l'étudiant ne verra
jamais.

Elle contrôle aussi la **durée de la douleur après l'arrêt du froid**, seul point qui sépare
l'hyperhémie de la pulpite réversible : la première s'arrête immédiatement, la seconde est vive puis
s'arrête en quelques secondes. Le contrôle porte sur les énoncés des cas **et** sur les
justifications affichées après coup — c'est par ces dernières que l'erreur était revenue, celle de
la pulpite réversible décrivant mot pour mot le tableau de l'hyperhémie.

Elle contrôle aussi ce qui **accompagne obligatoirement une extraction** : le granulome ou le kyste
apical ne part pas avec la dent — sans curetage il reste dans l'os et donne un kyste résiduel —, et
une fistule doit être nettoyée même quand la dent est enlevée. La règle est bidirectionnelle : sans
radioclarté constituée il n'y a rien à cureter, et sur une dent conservée la lésion guérit après le
traitement endodontique, de sorte qu'un curetage y relèverait de la chirurgie apicale et non d'un
geste d'urgence. Cette seconde moitié n'est pas décorative : c'est elle qui couvre la parodontite
apicale aiguë, dont le ligament est élargi sans lésion constituée.

Elle contrôle aussi les deux signes de la tuméfaction, qui ne disent pas la même chose : le **godet**
se creuse dans un œdème d'infiltration (cellulite séreuse, cellulite diffuse), le **reflux** purulent
signe une collection constituée (cellulite suppurée), et une collection sous tension ne prend pas le
godet. L'audit vérifie donc que seul le reflux correspond à un schéma collecté, qu'aucun diagnostic
n'affirme les deux à la fois, et qu'aucun ne reste sans réponse au reflux — une question sans corrigé
ne serait jamais notée.

Attention en particulier à `dit_collection` : la formule « sans reflux purulent » des cellulites
séreuses la faisait conclure à une collection, faute de gérer la négation. C'est l'exemple type du
faux positif décrit plus bas.

Elle contrôle aussi qu'une **restauration récente — donc étanche, sans reprise carieuse** — n'appelle
jamais de curetage : il n'y a pas de carie à cureter, y compris quand la dent est ouverte pour une
pulpotomie ou une pulpectomie — ouvrir la chambre n'est pas cureter. Et si aucun geste pulpaire n'est
réalisé, elle n'appelle pas non plus de reconstitution : l'étanchéité est déjà assurée. La règle
s'applique aux 86 cas et aux lignes du récapitulatif : une fiche qui annoncerait un curetage sous une
restauration étanche enseignerait durablement l'inverse du corrigé.

Et la **restauration coronaire du traitement final**. La règle ne se déduit pas du seul geste final :
une pulpite réversible n'a plus rien à faire sur la dent ce jour-là — le curetage a eu lieu à
l'urgence — et doit pourtant être restaurée définitivement. Ce qui est contrôlé est donc ce qui a été
fait à la dent en tout, urgence comprise : dent extraite ou dent jamais touchée, rien à reconstituer ;
dans tous les autres cas, restauration définitive. La règle est appliquée aux 86 cas et aux 22
lignes de la fiche récapitulative imprimable — c'est elle que l'étudiant relit chez lui, et une
ligne qui contredirait le corrigé y enseignerait durablement l'inverse. Un traitement final qui ne
déclarerait aucune restauration est signalé au même titre qu'une restauration fausse : sans clé
déclarée, la réponse de l'étudiant ne serait jamais corrigée.

Attention à ses détecteurs : ils interprètent du texte libre. Une négation non prévue
(« pas de radioclarté », « aucune douleur ni tuméfaction ») produit un faux positif, et une
formule trop permissive masquerait une vraie contradiction. Deux garde-fous en découlent :

- une formulation apicale **non reconnue est signalée**, jamais ignorée — un classificateur
  muet donne une fausse assurance sur les cas qu'il ne sait pas lire ;
- le texte radiographique par défaut est **reconstitué à l'identique** de l'application pour
  les cas qui n'en déclarent pas ; sans cela ils échappaient à tous les contrôles.

Après toute modification de ces expressions régulières, vérifiez qu'elles se déclenchent
encore, en dégradant volontairement une valeur du fichier (retirer une fistule, une
tuméfaction, une correction apicale) et en contrôlant que l'audit le signale.

`confettis.js` joue de vraies séries jusqu'au bout dans les deux modes : ce qui peut casser n'est
pas le tracé de l'animation, c'est la condition qui la déclenche. Obtenir un sans-faute suppose de
connaître le corrigé de cas tirés au hasard ; plutôt que d'en recopier une table — qui se périmerait
à la première modification de l'application —, le test **remplace `Math.random` par un générateur
déterministe** et joue chaque série deux fois : au premier passage il répond n'importe quoi et lit
les bonnes réponses dans la correction affichée, au second il rejoue la même série — identique,
puisque le tirage l'est — en répondant juste. Un rejeu qui n'atteint pas le sans-faute fait échouer
le test : sans cela, il ne prouverait rien.

Il contrôle ensuite le rendu réel du canvas, pas sa seule présence : les confettis doivent
**descendre** (le centre de gravité des pixels dessinés s'abaisse d'une mesure à l'autre) et la
pluie doit s'étoffer. Il vérifie aussi que la couche ne se met pas en travers — le clic au centre du
bouton « Recommencer une série » doit l'atteindre, lui et non le canvas —, qu'elle disparaît quand on
quitte l'écran de score comme à la fin de l'animation, et que rien ne tombe si le système demande de
réduire les animations. Il termine par `Erreurs : 0`.

Ses six mutations de contrôle : neutraliser le déclencheur de chaque mode, retirer
`pointer-events:none`, ignorer `prefers-reduced-motion`, supprimer l'arrêt au départ de l'écran de
score, et ne jamais retirer le canvas. Les six sont bien signalées.

`session-unique.js` rejoue le partage de compte sur une base **simulée partagée entre deux
navigateurs** — c'est exactement ce que voit le serveur quand deux appareils ouvrent le même compte.
Il vérifie que le second évince le premier — y compris en « Session individuelle », où l'on enchaîne
les cas sans jamais terminer de série ni quitter l'onglet : c'est le cas qui échappait au contrôle
tant que celui-ci n'avait lieu qu'en fin de série. Et surtout les deux façons dont ce garde-fou
pourrait se retourner contre un étudiant honnête : une panne réseau pendant la vérification ne doit jamais le
déconnecter, et une reconnexion après déconnexion propre ne doit pas le rejeter à l'instant où il
vient de taper son mot de passe. Il éprouve enfin le repli hors ligne, qui n'est borné par **aucun délai** : une panne du serveur ne
doit jamais priver un étudiant de ses révisions — c'est arrivé en octobre 2026, et une limite de 24 h
posée là aurait transformé une panne de trois jours en blocage général. Le test interdit qu'une telle
limite réapparaisse. Un compte **non validé**, lui, reste refusé même hors ligne. Il termine par
`Erreurs : 0`.

Ce repli laisse subsister une échappatoire au contrôle de session : rester hors ligne. Elle se paie —
hors ligne, aucun score n'est enregistré, aucune statistique ne remonte, aucun cas à revoir n'est
conservé — et c'est précisément ce que l'accès récompense. Le choix est assumé : mieux vaut une
échappatoire coûteuse qu'un étudiant honnête bloqué un jour de panne.

Sa fonction de connexion n'exige délibérément pas d'entrer dans l'application : plusieurs scénarios
vérifient précisément qu'on n'y entre pas. Attendre la levée de la porte y ferait échouer le test
par un plantage muet, au lieu du message qui nomme le problème.

Ses mutations de contrôle : supprimer l'éviction, supprimer la revendication faite à la connexion,
supprimer le contrôle en fin de cas, déconnecter sur une panne réseau, refuser le repli hors ligne,
et y laisser entrer un compte non validé. Toutes sont signalées.

`lecture-radio.js` couvre le troisième mode, celui de la lecture radiographique. Il est désormais
**ouvert à tout compte connecté et validé** : la mise au point est terminée, et le drapeau `radio`
qu'on accordait compte par compte depuis le back-office n'est plus lu. Deux portes restent fermées,
et ce sont elles que la suite surveille :

- **L'atelier de tracé**, qui modifie le corrigé sur lequel tous les étudiants sont notés.
- **Le choix du cliché**, qui remplacerait le tirage par une liste : on réviserait alors celui
  qu'on connaît déjà. Il suivait la même porte que le mode tant que l'enseignante y entrait seule ;
  ouvrir le mode à tous a obligé à l'en séparer, d'où **trois** portes dans `EndoTeacherModes`.

Le test éprouve le cas ordinaire — un étudiant connecté a le mode, et ni l'atelier ni la liste —,
puis force chaque porte : un bouton caché n'est pas une porte fermée, et l'atelier doit refuser de
s'ouvrir même appelé directement. Il vérifie aussi qu'**hors ligne le mode est fermé à tout le
monde**, l'enseignante comprise : le corrigé du serveur n'y est pas chargé, et un étudiant serait
noté sur des contours périmés. Le bouton doit alors être caché **et n'occuper aucune place** à
l'écran — une classe `hidden` neutralisée par une règle plus spécifique laisserait un bouton
invisible mais cliquable, défaut déjà rencontré trois fois dans ce projet.

Comme Supabase est coupé, aucun test en boîte noire ne peut simuler un compte **en ligne** : la
suite contrôle donc **dans la source** que `enterApp` ouvre le mode à tous (`accesRadio = !offline`,
sans aucun reste de `profile.radio`), qu'il réserve les deux autres portes au compte enseignant, et
que le bouton comme la liste partent cachés du HTML. Sans ces lignes, le mode se refermerait sur
presque tous les comptes — ou l'atelier s'ouvrirait à un étudiant — sans que rien ne le signale.

Le pointage lui-même ne peut pas être vérifié depuis une table de coordonnées recopiée : elle se
périmerait au premier déplacement d'un repère. Le test **remplace `Math.random` par un générateur
déterministe**, valide d'abord une lecture vide pour faire révéler par la correction les zones
attendues — les sommets de chaque contour, relevés dans la couche de correction, la couleur faisant
le lien avec le repère —, puis rejoue le même cliché. Il mesure alors la **marge de tolérance dans
les deux sens** : un point posé juste à l'extérieur du contour doit passer — le point a un rayon
visible, le poser au contact désigne bien la zone —, le même posé nettement plus loin doit être
refusé. Une seule des deux mesures ne prouverait rien — une tolérance devenue énorme, ou nulle,
passerait inaperçue. Les outils de géométrie du test (appartenance, aire, distance au bord,
auto-intersection) sont **éprouvés sur des figures connues** avant de servir : un détecteur muet
rendrait le même « 0 erreur » qu'un corrigé sain.

Combien de clichés existent ? L'application le dit, par `window.EndoRadioCliches`, et la suite
parcourt des graines jusqu'à les avoir tous ouverts — un cliché que le tirage ne proposerait jamais
serait un cliché jamais vérifié, ce qui est déjà arrivé. Mais cette liste ne peut pas être son propre
juge : si elle en oubliait un, la suite annoncerait « 2 / 2 » en toute bonne foi. Elle est donc
**recoupée avec deux sources qu'elle ne contrôle pas** — les images déclarées dans `RADIO_CASES`,
lues dans le source, et les fichiers réellement présents dans `radios/`. Les trois doivent coïncider.

Le **choix du cliché**, réservé lui aussi à l'enseignante, est vérifié des deux côtés : chaque entrée
de la liste doit ouvrir le cliché qu'elle nomme, le choix doit survivre à « Nouveau cliché » et
rester atteignable après la validation, et la ligne « à l'écran » doit nommer le fichier affiché. Du
côté étudiant, il ne suffit pas que la liste soit cachée : le test **force sa valeur** puis enchaîne
une douzaine de clichés, et exige que le tirage reste un tirage. Un contrôle d'affichage seul
laisserait passer une porte ouverte à qui inspecte le DOM.

Que la liste parte **cachée dans le HTML** ne peut se vérifier que dans la source, et c'est une
mutation qui l'a montré : `enterApp` appelle `EndoTeacherModes(false)` pour un étudiant et remet la
classe au chargement, si bien qu'un test en boîte noire voit une liste cachée même quand le HTML ne
la cache plus. Ce qui reste exposé est le bref instant *avant* cet appel — le défaut déjà rencontré
trois fois ici. Le test vérifie aussi, avant chaque `selectOption`, que la liste est toujours là :
sans cela, une liste disparue en cours de route faisait échouer Playwright sur un timeout et la
suite s'interrompait **sans nommer le défaut**, emportant les erreurs déjà relevées.

La couleur est le **seul lien** entre une entrée de la légende et son contour sur le film : deux
entrées de teintes voisines rendent ce lien ambigu. Le test mesure donc, légende par légende, l'écart
entre toutes les paires de pastilles — en CIE76 sur Lab, qui approche la perception bien mieux qu'une
distance entre composantes RVB — et refuse en dessous de 30. Le plancher est calibré sur le défaut
qui l'a motivé : l'amalgame et le composite étaient deux turquoises distantes de 28,2, sur deux zones
mitoyennes de la même dent. La paire légitime la plus serrée du catalogue est à 30,1 : la marge est
donc **mince**, et ce contrôle protège contre une aggravation plus qu'il ne garantit du confort. La
mesure est elle-même éprouvée sur ces deux turquoises avant de servir — un détecteur muet rendrait le
même « 0 erreur » qu'une palette saine. Deux repères peuvent partager une couleur tant qu'ils ne se
rencontrent jamais dans une même légende ; c'est le cliché, pas le catalogue, qui est jugé.

La correction affiche sous le cliché annoté une **copie intacte** du même film : les contours
colorés recouvrent justement ce qu'il s'agit d'apprendre à voir. Le test exige qu'elle soit cachée
avant la validation, présente après, qu'elle montre **le même fichier** que le cliché corrigé — une
copie d'un autre cliché serait pire que pas de copie —, qu'elle soit réellement rendue et chargée, et
qu'elle **disparaisse au cliché suivant**. Cette dernière mesure ne pouvait pas vivre dans les passes
par graine, qui repartent chacune d'une page neuve : une copie restée en place après « Nouveau
cliché » y serait passée inaperçue, alors qu'elle montrerait le cliché précédent pendant qu'on lit le
suivant.

La légende, enfin, ne doit pas **s'éteindre** quand un point est posé : un même repère peut figurer
deux fois sur un cliché, et une entrée estompée se donne pour épuisée. Le test mesure son opacité,
lit son compteur, et vérifie que le repère **reste choisi** après la dépose — un second point se pose
à la suite — tout en pouvant être relâché d'un nouveau toucher. Sans cette dernière mesure, un repère
resterait collé au pointeur et chaque clic ajouterait un point involontaire.

Il contrôle enfin que les trois fautes sont comptées **séparément** (repère mal situé, repère oublié,
signe posé à tort), et les gestes sans lesquels l'exercice serait inutilisable : un point lâché hors
du cliché ne se pose pas, un point déjà posé se déplace sans se dupliquer, un simple toucher le
retire, et le repli tactile — toucher la légende puis le cliché — pose bien le repère. Il termine par
`Erreurs : 0`.

Ce que la suite ne peut pas juger : la **justesse clinique** du corrigé de chaque cliché, puisque les
zones attendues sont lues dans l'application elle-même. C'est à l'enseignante de valider la liste des
repères de chaque cas — l'encadré affiché en tête du mode l'annonce explicitement.

Ses mutations de contrôle : ouvrir le choix du cliché aux étudiants, leur ouvrir l'atelier de
tracé, revenir au drapeau `radio` accordé compte par compte, retirer l'appel dans `enterApp`,
multiplier la tolérance par quatre, l'annuler, poser les points hors du cliché, retirer un cliché de
la liste déclarée, ignorer le choix de l'enseignante, la montrer aux étudiants dans le HTML, obéir à
la liste même cachée, la faire disparaître à la validation, vider la ligne « à l'écran », remettre
l'estompage dès le premier point, supprimer le compteur, relâcher le repère après chaque dépose, et
l'empêcher d'être relâché, cacher la copie sans annotation, la faire montrer un autre cliché, la
rendre sans largeur, la laisser en place au cliché suivant, et redonner à la lésion carieuse le doré
qui la rendait jumelle de la couronne céramo-métallique. Toutes sont signalées — deux ne
l'étaient pas au premier essai, et c'est ce qui a fait ajouter le contrôle en source et le garde-fou
de visibilité.

Une mutation ne l'est pas, et c'est délibéré : retirer `hidden` du HTML de la copie sans annotation
ne change rien d'observable. La carte entière est cachée au chargement, et `startRadioCase` masque la
copie dans le même bloc synchrone que l'affichage de la carte — il n'existe aucun instant où l'une
serait visible sans l'autre. Contrairement au bouton enseignant, dont l'appel ne vient qu'après
l'authentification, il n'y a pas de fenêtre de clignotement à protéger : un contrôle en source
n'attesterait ici de rien. C'est en examinant ce mutant équivalent qu'a été trouvé le vrai trou
voisin, la copie non retirée au cliché suivant.

`back-office.js` n'interroge **jamais la vraie base** : toutes les réponses Supabase sont
interceptées et remplacées par un jeu d'essai. C'est délibéré — un test ne doit pas
dépendre des données réelles des étudiants, ni risquer de les modifier.

Il contrôle aussi la feuille **« Cas joués »**, la seule vue qui dise *quand* un étudiant s'est
entraîné : un étudiant qui travaille sans jamais terminer de série n'apparaissait nulle part. Les
dates du jeu d'essai sont volontairement **désordonnées** — c'est ainsi que le test prouve que le
back-office trie lui-même, au lieu de se fier à l'ordre renvoyé par le serveur. Trois affichages en
dépendent : la colonne « Dernier cas », le panneau de détail et cette feuille ; une date fausse n'y
se verrait pas. Le jeu d'essai contient enfin les cas d'un compte **non validé**, qui ne doivent
jamais figurer dans le classeur.

Il contrôle aussi que les **comptes hors statistiques** n'entrent dans aucun chiffre. Ce tableau de
bord sert à suivre une promotion : le compte enseignant, et ceux dont on se sert pour vérifier que
l'application fonctionne, y comptaient comme des étudiants qui travaillent — ils gonflaient le
bandeau, s'affichaient au milieu des étudiants, et tiraient les taux d'erreur par pathologie, de
sorte qu'on reprenait en cours autre chose que ce qui est réellement raté. Les comptes, les séries
et les cas joués sont donc écartés **avant tout calcul**, à l'écran comme dans le classeur.

**Quatre** chemins les désignent, et le jeu d'essai en éprouve un par compte, séparément :

| Chemin | Compte d'essai | Ce qu'il couvre |
|---|---|---|
| Colonne `staff` | `Autre Essai` | Le bouton « ⊘ Hors stats » du back-office — le seul chemin qui ne dépende d'**aucune orthographe** |
| Table `admins` | `Hélène Durand` | Tout compte administrateur, d'office |
| Liste d'adresses | `Compte Essai` | Une adresse nommée dans `admin.html` sous un nom qui ne l'est pas |
| Liste de noms | `Marion Bertrand`, `ROUGEMON Clement` | Dont l'un saisi à l'envers et sans accent, pour éprouver la comparaison |

La correspondance par nom ignore la casse, les accents et l'**ordre des mots** — « Bertrand
Marion » et « Marion Bertrand » désignent la même personne. Elle reste la moins sûre des quatre :
un nom mal orthographié ferait manquer la correspondance en silence, et la promotion continuerait
d'être comptée de travers sans que rien ne le dise. C'est pourquoi le bouton existe.

Le retrait par bouton est joué **de bout en bout** : le faux serveur applique les écritures, sinon
un bouton pourrait « réussir » sans rien changer et le test ne prouverait que l'envoi de la
requête. Une étudiante est retirée des statistiques — ses cas quittent le bandeau —, puis remise :
elle doit retrouver **tout son passé**, rien n'ayant été effacé.

Les compteurs attendus ne sont pas recopiés à la main : le test les **recalcule** depuis son propre
jeu d'essai, comptes écartés retirés. Un total écrit en dur se périmerait au premier cas ajouté, et
c'est alors le test qu'on corrigerait plutôt que le défaut. Attention : le bandeau somme les trois
modes qu'il affiche, et le détail repère par repère n'en fait pas partie — un attendu qui
l'inclurait reprocherait au back-office un écart venu de son propre calcul.

Il exige enfin que ce qui est écarté se **voie**, et reste rattrapable : la page nomme les comptes
non comptés, et la carte « Comptes hors statistiques » donne pour chacun la raison de son retrait,
le chemin du retour, et son bouton d'accès radio — ces comptes ne figurant plus dans la liste des
étudiants, il n'y aurait sans cela plus aucun endroit pour le régler. Un compte qui disparaîtrait
sans trace, ou sans retour possible, serait pire que le problème corrigé.

Chaque bouton est **cherché avant d'être cliqué**, et son absence est un défaut nommé. C'est une
mutation qui l'a montré : sans cette garde, Playwright échouait sur un délai d'attente, la suite
s'interrompait **sans nommer le défaut**, et les erreurs déjà relevées étaient emportées au passage
— le même piège que dans `lecture-radio.js`.

Ses mutations de contrôle : ne plus écarter personne, et ignorer tour à tour chacun des quatre
chemins. Toutes sont signalées, chacune nommant les comptes qu'elle laisse passer.

Il télécharge ensuite le classeur Excel et le contrôle : archive ZIP intègre, XML bien
formé dans chaque partie, **compteurs de styles cohérents** (`<fonts count="4">` doit
réellement contenir quatre polices — un écart est la cause classique du message « contenu
illisible » d'Excel, et il passe totalement inaperçu à l'œil nu), feuilles reliées, puis
relecture par `openpyxl` pour vérifier que les dates sont de vraies dates et les
pourcentages de vrais nombres. Il termine par `Problèmes : 0`.

Le début de sa sortie — promotions détectées et tableau filtré pour chacune — reste à
relire à l'œil.

`openpyxl` est nécessaire à ce dernier contrôle :

```bash
pip install openpyxl
```

Sans lui, le test signale que la relecture n'a pas eu lieu mais vérifie tout le reste.

**Toute autre sortie signale un problème.** Les deux lignes à surveiller :

- `Missing` non vide → un cas n'a jamais été tiré. Soit il a été supprimé de
  l'application sans l'être du test, soit le tirage aléatoire ne le propose plus.
- `Failures` > 0 → la réponse attendue par le test diffère de celle de
  l'application. Le détail indique la pathologie, ce qui était attendu et ce qui a
  été refusé.

`cas-choix-therapeutique.js` vérifie aussi, sur chacun des 86 cas, que le rappel « pas de Cavit sur
dent vivante » n'apparaît **que** sur l'hyperhémie pulpaire et la pulpite réversible — les deux seuls
tableaux où la pulpe reste intégralement vivante. Le contrôle joue dans les deux sens : un rappel
affiché ailleurs est signalé, un rappel manquant sur ces deux-là aussi. Un rappel présent partout est
un rappel que l'étudiant apprend à ne plus lire.

`cas-choix-therapeutique.js` contrôle en outre la **fiche récapitulative imprimable** : ses trois
axes y sont enchaînés par des « + » sans libellé, et un « Aucun » isolé en fin de ligne s'y lit comme
un acte de plus dont on ignore l'objet. C'est un étudiant qui l'a signalé, pas un test — d'où ce
garde-fou sur le symptôme exact. Il échoue si aucune ligne n'est rendue : un contrôle qui ne voit
rien ne prouve rien.

## Fonctionnement

Le test parcourt les modes en tirant des cas au hasard jusqu'à les avoir tous
rencontrés, coche pour chacun les cases correspondant au corrigé attendu, valide,
puis vérifie que l'application déclare la réponse correcte.

Deux détails d'implémentation méritent explication :

- Le test **coupe l'accès à Supabase** et se présente comme un compte déjà validé.
  L'application bascule alors sur son repli hors ligne, ce qui permet de traverser
  l'écran de connexion sans compte réel ni écriture en base.
- Il **retire l'écran d'ouverture** du DOM pour ne pas attendre l'animation. Cela
  provoque des erreurs `Cannot read properties of null` dans la console du
  navigateur : ce sont les animations différées de cet écran qui ne trouvent plus
  leurs éléments. C'est un artefact du test, sans effet en usage réel — un
  utilisateur ne supprime pas l'écran d'ouverture en pleine animation.

## Mettre le test à jour

Le corrigé attendu est déclaré en haut du fichier, par prénom de patient. En
ajoutant ou modifiant un cas dans `index.html`, reportez-y la même modification —
sans quoi le test échouera, ce qui est précisément son rôle.

## Voir aussi

`supabase/test-rls.sql` vérifie, lui, les règles de sécurité de la base : qu'un
étudiant ne peut ni s'auto-valider, ni se déclarer administrateur, ni lire les
données d'un camarade.

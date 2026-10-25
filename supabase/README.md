# Base de données EndoDiag (Supabase)

Ce dossier contient tout ce qui concerne la base de données. Il n'a **aucun effet
sur l'application tant que le script n'a pas été exécuté** dans Supabase.

## Si votre base existe déjà

Le script est **ré-exécutable** : relancez-le tel quel dans l'éditeur SQL après
chaque mise à jour de l'application. Il ne supprime aucune donnée, crée ce qui
manque, et remplace la contrainte de `case_results` — une contrainte posée à la
création d'une table ne bouge pas toute seule, et tant qu'elle n'est pas
remplacée la base **refuse toute lecture radiographique**.

## Mise en place — à faire une seule fois

### 1. Créer les tables

1. Ouvrir le tableau de bord Supabase du projet.
2. Menu de gauche → **SQL Editor** → **New query**.
3. Coller l'intégralité de `schema.sql`.
4. Cliquer sur **Run**.

Le script est **ré-exécutable sans risque** : il ne supprime aucune donnée et
peut être relancé si une étape échoue. Les messages
`NOTICE: ... does not exist, skipping` sont normaux au premier lancement.

### 2. Créer son compte enseignant

Dans l'application : s'inscrire normalement avec l'adresse
`drbertrandmarion@gmail.com`, puis **confirmer l'e-mail** reçu.

### 3. Se déclarer administratrice

Retourner dans **SQL Editor** et exécuter :

```sql
insert into public.admins (user_id)
select id from auth.users
where email = 'drbertrandmarion@gmail.com'
on conflict (user_id) do nothing;
```

Vérification :

```sql
select u.email
from public.admins a
join auth.users u on u.id = a.user_id;
```

L'adresse doit apparaître. Sans cette étape, le back-office reste vide.

## Ce que le schéma garantit

La sécurité est appliquée par PostgreSQL (Row Level Security), pas par
l'application. Même en récupérant la clé publique — qui est de toute façon
visible dans le code de la page — personne ne peut contourner ces règles.

| Un étudiant peut | Un étudiant ne peut pas |
|---|---|
| Créer et modifier son profil | S'auto-valider |
| Lire ses propres résultats | Lire le profil ou les résultats d'un autre |
| Enregistrer ses propres scores | Enregistrer un score au nom d'un autre |
| | Se déclarer administrateur |
| | S'accorder la lecture radiographique (`radio`) |
| | Se retirer des statistiques (`staff`) |
| Enregistrer ses propres lectures radiographiques | Enregistrer une lecture au nom d'un autre |
| | Modifier le corrigé tracé (`radio_traces`) |

L'administratrice, elle, lit tous les profils et résultats, valide et supprime.

`staff` se décide depuis le back-office, jamais depuis l'application : il retire
un compte des chiffres de la promotion.

`radio` n'est plus lu : la lecture radiographique s'ouvre désormais à tout compte
connecté. La colonne et sa protection sont conservées — effacer une colonne
efface ce qu'elle contient, et un ancien drapeau ne doit pas redevenir une porte
si ce mode devait un jour se refermer.

## Vérifier soi-même ces garanties

`test-rls.sql` rejoue ces dix-neuf situations sur une base PostgreSQL jetable
(pas sur la base de production). Il sert de preuve reproductible que les règles
de sécurité font bien ce qui est annoncé, notamment après toute modification du
schéma.

```bash
initdb -D /tmp/pgtest -A trust
pg_ctl -D /tmp/pgtest -o '-p 5433 -k /tmp' start
createdb -h /tmp -p 5433 endodiag_test
# recréer le contexte Supabase minimal (schéma auth + fonction auth.uid),
# puis :
psql -h /tmp -p 5433 -d endodiag_test -f schema.sql
psql -h /tmp -p 5433 -d endodiag_test -f test-rls.sql
```

## Tables

| Table | Contenu |
|---|---|
| `profiles` | Nom, prénom, année, faculté, état de validation, dernière connexion, hors statistiques (`staff`), et `radio` — conservée, mais plus lue |
| `admins` | Comptes enseignants — volontairement hors de `profiles` |
| `results` | Une ligne par série terminée (score, nombre de cas, mode) |
| `case_results` | Une ligne par cas traité — sert aux pathologies les plus ratées |
| `radio_traces` | Les contours tracés par l'enseignante — le corrigé sur lequel tous sont notés |
| `radio_lectures` | Les vingt dernières lectures radiographiques de chaque étudiant, **avec la position de ses points** |

## Données personnelles

Les tables contiennent des données personnelles d'étudiants (nom, prénom,
adresse e-mail, faculté, année). Le projet est hébergé en **Irlande
(`eu-west-1`)**, donc dans l'Union européenne.

Restent à définir avant tout usage réel : le responsable de traitement, la durée
de conservation, et la mention d'information présentée à l'inscription.

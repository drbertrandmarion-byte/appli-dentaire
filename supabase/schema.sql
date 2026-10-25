-- =============================================================================
--  EndoDiag — schéma de base de données (Supabase / PostgreSQL)
-- =============================================================================
--  À coller dans : tableau de bord Supabase → SQL Editor → New query → Run
--
--  Ce script est ré-exécutable sans risque : il ne détruit aucune donnée
--  existante et peut être relancé si une étape a échoué.
--
--  Principe de sécurité : toutes les tables sont protégées par RLS (Row Level
--  Security). Les règles sont appliquées par PostgreSQL lui-même, pas par
--  l'application. Même si quelqu'un récupérait la clé publique de l'application
--  (elle est visible dans le code de la page, c'est normal), il ne pourrait lire
--  que ses propres données.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table des administrateurs
-- -----------------------------------------------------------------------------
-- Contient les comptes enseignants. Volontairement séparée des profils : être
-- administrateur n'est pas un champ que l'on peut modifier depuis l'application.

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;


-- Fonction utilitaire : « la personne connectée est-elle administratrice ? »
-- SECURITY DEFINER lui permet de consulter la table admins sans être bloquée
-- par RLS, ce qui évite une récursion infinie dans les règles ci-dessous.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- Seuls les administrateurs voient la liste des administrateurs.
drop policy if exists "admins_select" on public.admins;
create policy "admins_select" on public.admins
  for select using (public.is_admin());


-- -----------------------------------------------------------------------------
-- 2. Profils étudiants
-- -----------------------------------------------------------------------------
-- Un profil est créé par l'étudiant à l'inscription, mais reste inactif
-- (approved = false) tant qu'un administrateur ne l'a pas validé.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  prenom       text not null,
  nom          text not null,
  annee        text not null,
  faculte      text not null,
  approved     boolean not null default false,
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  last_seen_at timestamptz
);

-- Session unique : identifiant du navigateur qui détient la session en cours, et date de sa
-- revendication. L'accès étant une récompense pour les étudiants présents en cours, un compte
-- ouvert sur cinq appareils lui ôterait sa valeur.
--
-- Ces deux colonnes ne figurent PAS dans protect_profile_fields() : l'étudiant doit pouvoir les
-- écrire lui-même, c'est tout le mécanisme. La règle "profiles_update" le limite déjà à sa propre
-- fiche (id = auth.uid()), il ne peut donc pas fermer la session d'un camarade ; et
-- "profiles_select" l'empêche de lire l'identifiant de quiconque.
alter table public.profiles add column if not exists active_session    text;
alter table public.profiles add column if not exists active_session_at timestamptz;

-- Accès au mode de lecture radiographique, le temps de sa mise au point : il n'était alors
-- montré qu'aux comptes qui l'éprouvaient, et s'accordait un par un depuis le back-office.
--
-- CETTE COLONNE N'EST PLUS LUE : la partie est terminée, et le mode s'ouvre à tout compte
-- connecté. Elle est conservée plutôt que supprimée — effacer une colonne efface ce qu'elle
-- contient, et rien ne l'exige. Elle reste protégée ci-dessous, pour qu'un ancien drapeau ne
-- redevienne pas une porte si ce mode devait un jour se refermer.
--
-- Elle manquait à ce script alors que le back-office l'écrivait depuis sa création : une base
-- installée à partir d'ici seule avait un bouton « 📷 Radio » qui échouait. Et rien ne la
-- protégeait : un étudiant se l'accordait lui-même d'une seule requête sur sa propre fiche, et
-- entrait dans un mode qui lui montrait les corrigés.
alter table public.profiles add column if not exists radio boolean not null default false;

-- Comptes hors statistiques. Le back-office sert à suivre une promotion : le compte enseignant,
-- et ceux dont on se sert pour vérifier régulièrement que l'application fonctionne, n'en font pas
-- partie. Rien n'est effacé — les séries et les cas restent enregistrés — mais ils n'entrent dans
-- aucun chiffre du back-office ni du classeur exporté.
--
-- Cette colonne est posée depuis le back-office plutôt que déduite d'une liste de noms écrite
-- dans le code : un nom mal orthographié ferait manquer la correspondance en silence, et la
-- promotion continuerait d'être comptée de travers sans que rien ne le dise.
--
-- Elle figure aussi dans protect_profile_fields() : sans cela un étudiant se retirerait lui-même
-- des statistiques.
alter table public.profiles add column if not exists staff boolean not null default false;

alter table public.profiles enable row level security;

create index if not exists profiles_approved_idx on public.profiles (approved, created_at desc);


-- Lecture : chacun voit son profil ; l'administrateur voit tout le monde.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Création : uniquement son propre profil, et jamais déjà validé.
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (id = auth.uid() and approved = false);

-- Modification : son propre profil, ou n'importe lequel pour l'administrateur.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- Suppression : réservée à l'administrateur (retirer un faux compte).
drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (public.is_admin());


-- Garde-fou : un étudiant peut corriger son nom ou son année, mais ne peut pas
-- s'auto-valider. Sans ce déclencheur, la règle "profiles_update" ci-dessus le
-- laisserait passer approved à true lui-même.
--
-- Même raisonnement pour « radio » et « staff », qui s'ajoutent ici : la première ouvre un mode
-- qui montre les corrigés, la seconde retire un compte des statistiques. Toutes deux se décident
-- depuis le back-office, donc jamais depuis l'application.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.id          := old.id;
    new.email       := old.email;
    new.approved    := old.approved;
    new.approved_at := old.approved_at;
    new.created_at  := old.created_at;
    new.radio       := old.radio;
    new.staff       := old.staff;
  end if;

  -- Horodate automatiquement la validation.
  if new.approved and not old.approved then
    new.approved_at := now();
  elsif not new.approved then
    new.approved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_fields();


-- Création automatique du profil à l'inscription.
-- Nécessaire parce que la confirmation par e-mail est obligatoire : au moment de
-- l'inscription l'étudiant n'a pas encore de session, il ne peut donc pas insérer
-- sa propre fiche. L'application transmet prénom / nom / année / faculté dans les
-- métadonnées du compte, et ce déclencheur les recopie ici.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, prenom, nom, annee, faculte)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'prenom',  ''),
    coalesce(new.raw_user_meta_data ->> 'nom',     ''),
    coalesce(new.raw_user_meta_data ->> 'annee',   ''),
    coalesce(new.raw_user_meta_data ->> 'faculte', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 3. Résultats des séries notées
-- -----------------------------------------------------------------------------
-- Une ligne par série terminée : sert à l'évolution de l'étudiant et à vos
-- statistiques de promotion.

create table if not exists public.results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  mode       text not null check (mode in ('diagnostic', 'therapeutique')),
  serie      integer not null check (serie > 0),   -- nombre de cas (1, 5, 10)
  score      integer not null check (score >= 0),  -- cas réussis
  created_at timestamptz not null default now(),
  constraint results_score_coherent check (score <= serie)
);

alter table public.results enable row level security;

create index if not exists results_user_idx on public.results (user_id, created_at desc);

drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "results_insert" on public.results;
create policy "results_insert" on public.results
  for insert with check (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 4. Résultats par cas
-- -----------------------------------------------------------------------------
-- Une ligne par cas traité : permet de repérer les pathologies les plus ratées,
-- individuellement et à l'échelle de la promotion.

create table if not exists public.case_results (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- QUATRE modes, et non deux. L'application écrit aussi « radio » (un cliché lu en entier)
  -- et « radio_repere » (le détail, repère par repère), et ce script était resté en arrière :
  -- une base créée à partir de lui seul refusait toute lecture radiographique, avec un code
  -- 400 que l'application tient pour un refus définitif et met de côté sans rien dire. La
  -- base en service, elle, avait été élargie à la main — ce qui est précisément la raison de
  -- remettre le script d'accord avec elle, sans quoi l'écart se paie à la prochaine
  -- installation.
  mode         text not null check (mode in ('diagnostic', 'therapeutique', 'radio', 'radio_repere')),
  diagnosis_id text not null,        -- ex. 'abces_aigu', 'necrose', ou le nom du cliché
  correct      boolean not null,
  created_at   timestamptz not null default now()
);

-- « create table if not exists » ne touche pas à une table déjà créée : sur une base
-- existante, la contrainte posée à la création resterait en place, quelle qu'elle soit. On la
-- remplace donc explicitement, pour que ce script décrive bien ce que la base applique.
-- Relancer ce script est sans risque : la contrainte est supprimée puis reposée à l'identique.
alter table public.case_results drop constraint if exists case_results_mode_check;
alter table public.case_results add constraint case_results_mode_check
  check (mode in ('diagnostic', 'therapeutique', 'radio', 'radio_repere'));

alter table public.case_results enable row level security;

create index if not exists case_results_user_idx on public.case_results (user_id, created_at desc);
create index if not exists case_results_diag_idx on public.case_results (diagnosis_id, correct);

drop policy if exists "case_results_select" on public.case_results;
create policy "case_results_select" on public.case_results
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "case_results_insert" on public.case_results;
create policy "case_results_insert" on public.case_results
  for insert with check (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 5. Cas rates conserves pour relecture
-- -----------------------------------------------------------------------------
-- Volontairement distincte de case_results : celle-ci ne garde que des lignes
-- minuscules pour les statistiques, tandis qu'ici on conserve le détail d'un cas
-- raté (énoncé, réponse donnée, réponse attendue) pour que l'étudiant puisse le
-- revoir. L'application n'en garde que les vingt derniers par personne et efface
-- les plus anciens : le volume reste borné.

create table if not exists public.review_cases (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  mode         text not null check (mode in ('diagnostic', 'therapeutique')),
  diagnosis_id text not null,
  patient      text,   -- énoncé abrégé, pour reconnaître le cas
  given        text,   -- ce que l'étudiant a répondu
  expected     text,   -- ce qui était attendu
  created_at   timestamptz not null default now()
);

alter table public.review_cases enable row level security;

create index if not exists review_cases_user_idx on public.review_cases (user_id, created_at desc);

drop policy if exists "review_cases_select" on public.review_cases;
create policy "review_cases_select" on public.review_cases
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "review_cases_insert" on public.review_cases;
create policy "review_cases_insert" on public.review_cases
  for insert with check (user_id = auth.uid());

-- Nécessaire pour que l'application puisse effacer ses propres cas les plus
-- anciens et maintenir le plafond de vingt.
drop policy if exists "review_cases_delete" on public.review_cases;
create policy "review_cases_delete" on public.review_cases
  for delete using (user_id = auth.uid() or public.is_admin());


-- -----------------------------------------------------------------------------
-- 6. Corriges traces par l'enseignante
-- -----------------------------------------------------------------------------
-- Les contours que l'enseignante dessine dans l'atelier. Sans cette table, sa correction
-- resterait prisonniere de l'appareil ou elle l'a faite, et les etudiants seraient notes sur
-- les ebauches ecrites dans le code.
--
-- Elle manquait a ce script alors que l'application l'interroge a chaque ouverture du mode.
-- L'ecriture est reservee a l'administratrice : c'est le corrige sur lequel tout le monde est
-- note. La lecture est ouverte a tout compte connecte, puisque c'est elle qui corrige.

create table if not exists public.radio_traces (
  case_id    text primary key,       -- identifiant du cliche
  zones      jsonb not null,         -- contours, par repere
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.radio_traces enable row level security;

drop policy if exists "radio_traces_select" on public.radio_traces;
create policy "radio_traces_select" on public.radio_traces
  for select using (auth.uid() is not null);

drop policy if exists "radio_traces_write" on public.radio_traces;
create policy "radio_traces_write" on public.radio_traces
  for all using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 7. Lectures radiographiques conservees pour relecture
-- -----------------------------------------------------------------------------
-- OU l'etudiant a pose ses reperes, et non seulement combien il en a rate. C'est ce que
-- case_results ne peut pas dire : il n'y garde qu'un verdict par repere, sans coordonnees, et
-- deux etudiants qui se trompent de la meme facon y sont indiscernables.
--
-- Une ligne par lecture validee. Les points sont conserves tels que l'etudiant les a poses,
-- dans les unites du viewBox du cliche (360 x 270), avec le libelle et la couleur qu'il avait
-- sous les yeux : ainsi le back-office redessine ce qu'il a vu, sans dependre d'un catalogue
-- qui aura peut-etre change depuis.
--
-- L'application n'en garde que les vingt dernieres par personne et efface les plus anciennes,
-- comme pour review_cases : le volume reste borne quel que soit l'usage.

create table if not exists public.radio_lectures (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  case_id    text not null,          -- identifiant du cliche
  image      text not null,          -- chemin du fichier, pour que le back-office l'affiche
  points     jsonb not null,         -- [{id, label, color, x, y, ok}] tels que poses
  manques    jsonb not null default '[]'::jsonb,  -- reperes attendus et jamais poses
  correct    boolean not null,       -- lecture juste en entier
  created_at timestamptz not null default now()
);

alter table public.radio_lectures enable row level security;

create index if not exists radio_lectures_user_idx
  on public.radio_lectures (user_id, created_at desc);

drop policy if exists "radio_lectures_select" on public.radio_lectures;
create policy "radio_lectures_select" on public.radio_lectures
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "radio_lectures_insert" on public.radio_lectures;
create policy "radio_lectures_insert" on public.radio_lectures
  for insert with check (user_id = auth.uid());

-- Necessaire pour que l'application puisse effacer ses propres lectures les plus anciennes.
drop policy if exists "radio_lectures_delete" on public.radio_lectures;
create policy "radio_lectures_delete" on public.radio_lectures
  for delete using (user_id = auth.uid() or public.is_admin());


-- =============================================================================
--  FIN DU SCRIPT PRINCIPAL
-- =============================================================================
--
--  ÉTAPE SUIVANTE, à faire UNE SEULE FOIS et SEULEMENT APRÈS avoir créé votre
--  compte enseignant dans l'application (inscription + confirmation par e-mail) :
--  revenez ici et exécutez la commande ci-dessous pour vous déclarer
--  administratrice. Elle ne fonctionnera pas tant que le compte n'existe pas.
--
--      insert into public.admins (user_id)
--      select id from auth.users
--      where email = 'drbertrandmarion@gmail.com'
--      on conflict (user_id) do nothing;
--
--  Pour vérifier ensuite que cela a bien fonctionné :
--
--      select u.email
--      from public.admins a
--      join auth.users u on u.id = a.user_id;
--
-- =============================================================================

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
  mode         text not null check (mode in ('diagnostic', 'therapeutique')),
  diagnosis_id text not null,        -- ex. 'abces_aigu', 'necrose'
  correct      boolean not null,
  created_at   timestamptz not null default now()
);

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

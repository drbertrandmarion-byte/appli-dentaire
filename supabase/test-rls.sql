\set ON_ERROR_STOP off
\pset pager off

-- Reproduit le rôle "authenticated" de Supabase (non-superutilisateur : RLS s'applique)
create role authenticated nologin;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Deux étudiants + l'enseignante
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'etudiant.un@gmail.com'),
  ('22222222-2222-2222-2222-222222222222', 'etudiant.deux@gmail.com'),
  ('33333333-3333-3333-3333-333333333333', 'drbertrandmarion@gmail.com');

\echo ''
\echo '=========== ÉTUDIANT 1 =========='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '-- 1. crée son propre profil (doit REUSSIR)'
insert into public.profiles (id, email, prenom, nom, annee, faculte)
values ('11111111-1111-1111-1111-111111111111', 'etudiant.un@gmail.com', 'Jean', 'Dupont', 'DFASO1', 'Bordeaux');

\echo ''
\echo '-- 2. tente de s inscrire DEJA VALIDE (doit ECHOUER)'
insert into public.profiles (id, email, prenom, nom, annee, faculte, approved)
values ('11111111-1111-1111-1111-111111111111', 'x@gmail.com', 'X', 'X', 'X', 'X', true);

\echo ''
\echo '-- 3. tente de creer le profil de QUELQU UN D AUTRE (doit ECHOUER)'
insert into public.profiles (id, email, prenom, nom, annee, faculte)
values ('22222222-2222-2222-2222-222222222222', 'etudiant.deux@gmail.com', 'Faux', 'Profil', 'DFASO1', 'Bordeaux');

\echo ''
\echo '-- 4. tente de S AUTO-VALIDER (ne doit pas planter, mais approved doit rester false)'
update public.profiles set approved = true where id = '11111111-1111-1111-1111-111111111111';
select prenom, approved as "approved (attendu: f)" from public.profiles where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '-- 5. corrige son annee (doit REUSSIR)'
update public.profiles set annee = 'DFASO2' where id = '11111111-1111-1111-1111-111111111111';
select annee as "annee (attendu: DFASO2)" from public.profiles where id = '11111111-1111-1111-1111-111111111111';

reset role;
insert into public.profiles (id, email, prenom, nom, annee, faculte)
values ('22222222-2222-2222-2222-222222222222', 'etudiant.deux@gmail.com', 'Marie', 'Martin', 'DFGSO3', 'Paris');

\echo ''
\echo '=========== ÉTUDIANT 1 face aux donnees d AUTRUI =========='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '-- 6. combien de profils voit-il ? (attendu: 1, le sien)'
select count(*) as "profils visibles" from public.profiles;

\echo ''
\echo '-- 7. enregistre un resultat pour lui-meme (doit REUSSIR)'
insert into public.results (user_id, mode, serie, score)
values ('11111111-1111-1111-1111-111111111111', 'therapeutique', 5, 4);

\echo ''
\echo '-- 8. tente d enregistrer un resultat au nom d un autre (doit ECHOUER)'
insert into public.results (user_id, mode, serie, score)
values ('22222222-2222-2222-2222-222222222222', 'therapeutique', 5, 5);

\echo ''
\echo '-- 9. tente de se declarer administrateur (doit ECHOUER)'
insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');

reset role;

\echo ''
\echo '=========== ENSEIGNANTE (administratrice) =========='
insert into public.admins (user_id) values ('33333333-3333-3333-3333-333333333333');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

\echo '-- 10. voit-elle tous les profils ? (attendu: 2)'
select count(*) as "profils visibles" from public.profiles;

\echo ''
\echo '-- 11. valide un etudiant (doit REUSSIR, et horodater)'
update public.profiles set approved = true where id = '11111111-1111-1111-1111-111111111111';
select prenom, approved as "approved (attendu: t)",
       (approved_at is not null) as "horodate (attendu: t)"
from public.profiles where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '-- 12. voit-elle les resultats de tous ? (attendu: 1)'
select count(*) as "resultats visibles" from public.results;

\echo ''
\echo '-- 13. supprime un faux profil (doit REUSSIR)'
delete from public.profiles where id = '22222222-2222-2222-2222-222222222222';
select count(*) as "profils restants (attendu: 1)" from public.profiles;

reset role;

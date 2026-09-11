-- Read-only pre-migration audit. No DDL, RPC imports, Auth writes or personal data.
-- Run only with an administrative read connection; never paste credentials here.
begin read only;
select jsonb_build_object(
  'checked_at', now(),
  'applied_migrations', (select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version)
    from supabase_migrations.schema_migrations),
  'rules', (select jsonb_agg(jsonb_build_object('version',version,'title',title,
    'content_markdown',content_markdown,'is_current',is_current,
    'published_at',published_at,'retired_at',retired_at) order by version) from public.community_rules),
  'rules_guard_matches', (select count(*)=1 and bool_and(version=1 and is_current
    and title='Vital Community Rules' and published_at<=now() and retired_at is null
    and btrim(content_markdown)=btrim($previous_rules$
1. Be kind and respectful. Harassment, bullying, hate, threats, and abuse are not welcome.
2. Keep children safe. Do not sexualise children or share identifying or sensitive information about them.
3. Protect privacy. Do not post another person's private or personal information without permission.
4. Keep content appropriate for a family community and do not post sexual, violent, or exploitative material.
5. Do not spam, scam, impersonate others, or deliberately spread dangerous misinformation.
6. Take care with health, safety, and wellbeing advice. Personal experience is not a substitute for professional help.
7. Report concerning content to the Vital team rather than escalating conflict in the community.
$previous_rules$)) from public.community_rules),
  'profiles', jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'missing_auth', (select count(*) from public.profiles p left join auth.users u on u.id=p.id where u.id is null),
    'auth_seed_markers', (select count(*) from public.profiles p join auth.users u on u.id=p.id
      where coalesce(u.raw_app_meta_data->>'is_seeded','false')<>'false' or u.raw_app_meta_data->>'seed_key' is not null),
    'known_starter_names', (select count(*) from public.profiles where display_name=any(array[
      'MidgetMary','Sophie M','WelshMam','LeanneP','RainyDayRachel','Priya N','LauraJ','Nicola G','Katie E','Aisha H',
      'MumOfMonsters','Sarah D','AmyK','ClaireBear','SuperMum','DadBodDan','GarethJ','Tom H','OutdoorDad','Mike P',
      'BenA','PurplePenguin','CoffeeFirst','ChaosCoordinator','JustJo','SnackDealer','TinyTornadoes','ProbablyLost','CheeseToastie','TwoLeftWellies'])),
    'explicit_test_names', (select count(*) from public.profiles where display_name ~* '(^test([ _-]|$)|test fixture|automated-test)'),
    'original_auth_fk', (select jsonb_build_object('definition',pg_catalog.pg_get_constraintdef(c.oid),'validated',c.convalidated)
      from pg_catalog.pg_constraint c where c.conrelid='public.profiles'::regclass and c.conname='profiles_id_fkey'),
    'new_auth_link_already_present', exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='auth_user_id')
  ),
  'auth_signup_trigger', (select pg_catalog.pg_get_triggerdef(t.oid) from pg_catalog.pg_trigger t
    where t.tgrelid='auth.users'::regclass and t.tgname='on_auth_user_created'),
  'community_counts', jsonb_build_object(
    'posts',(select count(*) from public.community_posts),
    'comments',(select count(*) from public.community_comments),
    'post_reactions',(select count(*) from public.community_post_reactions),
    'comment_reactions',(select count(*) from public.community_comment_reactions),
    'revisions',(select count(*) from public.community_content_revisions),
    'reports',(select count(*) from public.community_reports),
    'moderation_actions',(select count(*) from public.community_moderation_actions),
    'restrictions',(select count(*) from public.community_user_restrictions),
    'rules_acceptances',(select count(*) from public.community_rule_acceptances),
    'seed_ledger_exists',to_regclass('public.community_seed_imports') is not null
  ),
  'content_counts', jsonb_build_object(
    'activities',(select count(*) from public.activities),
    'resources',(select count(*) from public.resources),
    'relationships',(select count(*) from public.activity_resources)
  ),
  'rescue', (select jsonb_build_object('id',id,'title',title,'instructions',instructions,'updated_at',updated_at,
    'migration_guard_matches', title='Rescue the Explorer'
      and instructions like 'Hide a toy explorer somewhere around a garden or park.%',
    'replacement_occurrences',(length(instructions)-length(replace(instructions,
      'Hide a toy explorer somewhere around a garden or park.','')))/length('Hide a toy explorer somewhere around a garden or park.'))
    from public.activities where id='VK-5-7-0018')
) as preflight;
rollback;

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCommunityApi } from '../src/features/community/community-api.ts';
import { appendCommunityPage, communityInitials, participationMessage, removeCommunityPageItems, updateCommunityPageItem, validatePostDraft, validateReply } from '../src/features/community/community-model.ts';

function fakeClient(responses = {}) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'current-member' } } }, error: null }) },
    rpc(name, args) { calls.push({ name, args }); return Promise.resolve(responses[name] ?? { data: { items: [], hasMore: false, nextOffset: 20 }, error: null }); },
    from(table) {
      const call = { table, operations: [] }; calls.push(call);
      const builder = { then(resolve) { const configured=responses[table]; return Promise.resolve(typeof configured==='function'?configured(call):configured ?? { data: { id: 'created-post' }, error: null }).then(resolve); } };
      for (const method of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'range', 'limit', 'ilike', 'single', 'maybeSingle']) builder[method] = (...args) => { call.operations.push({ method, args }); return builder; };
      return builder;
    },
  };
  return { api: createCommunityApi(client), calls };
}
test('post/reply validation preserves long content and gives understandable limits', () => {
  const draft = { title: 'Question', body: 'Useful detail 🙂', postType: 'question', topic: 'Kids', activityId: null };
  assert.equal(validatePostDraft(draft),null);
  assert.match(validatePostDraft({ ...draft,title:' ' }),/title/);
  assert.match(validatePostDraft({ ...draft,body:'a'.repeat(20001) }),/20,000/);
  assert.equal(validateReply('a'.repeat(10000)),null);
  assert.match(validateReply('a'.repeat(10001)),/10,000/);
});
test('search, type/topic/order and Show More use bounded server parameters', async () => {
  const { api,calls } = fakeClient();
  await api.posts({ search:'family bread',topic:'Food',postType:'tip',order:'relevant' },20);
  assert.deepEqual(calls[0], { name:'search_community_posts', args:{ search_text:'family bread',selected_topic:'Food',selected_type:'tip',ordering:'relevant',page_offset:20,page_size:20,provenance:'combined' } });
  await api.replies('post-id',40); assert.equal(calls[1].args.page_size,20); assert.equal(calls[1].args.page_offset,40);
});
test('post/reply writes take the session identity and do not accept role/provenance spoofing', async () => {
  const { api,calls } = fakeClient();
  await api.createPost({ title:'Title',body:'Body',postType:'idea',topic:null,activityId:'VK-5-7-0018',author_id:'spoof',is_seeded:true });
  const write = calls[0].operations.find(op=>op.method==='insert').args[0];
  assert.equal(write.author_id,'current-member'); assert.equal(write.activity_id,'VK-5-7-0018'); assert.equal(Object.hasOwn(write,'is_seeded'),false);
  await api.reply('p','reply','root-reply');
  assert.equal(calls[1].operations[0].args[0].parent_comment_id,'root-reply');
});
test('Helpful uses existing upsert; removal remains a DELETE scoped to the current profile', async () => {
  const { api,calls } = fakeClient();
  await api.helpful('post','p',false); assert.equal(calls[0].operations[0].args[0].reaction_type,'helpful');
  await api.helpful('comment','c',true); assert.equal(calls[1].operations[0].method,'delete');
  assert.ok(calls[1].operations.some(op=>op.method==='eq' && op.args[0]==='profile_id' && op.args[1]==='current-member'));
});
test('reports use existing spam category without a participation gate and repeated open reports are accepted', async () => {
  const { api,calls } = fakeClient({ community_reports: { error:{ code:'23505' },data:null } });
  await api.report({type:'post',id:'p',authorId:'someone',authorSeeded:false},'spam_scam','Promotional concern');
  assert.equal(calls[0].operations[0].args[0].reason_category,'spam_scam');
  assert.equal(calls.length,1);
});
test('block, status, private list and unblock use only the signed-in member direction', async () => {
  const response = call => call.operations.some(op=>op.method==='delete')
    ? {data:[{blocked_profile_id:'member-b'}],error:null}
    : {data:{blocked_profile_id:'member-b'},error:null};
  const {api,calls}=fakeClient({community_blocks:response,community_blocked_members:{data:[{profile_id:'member-b',display_name:'Member B',avatar_url:null,blocked_at:'2026-09-13T12:00:00Z'}],error:null}});
  await api.block('member-b');
  assert.equal(calls[0].table,'community_blocks');
  assert.deepEqual(calls[0].operations.find(op=>op.method==='upsert').args[0],{blocker_id:'current-member',blocked_profile_id:'member-b'});
  assert.equal(await api.isBlocked('member-b'),true);
  assert.deepEqual(await api.blockedMembers(),[{profileId:'member-b',displayName:'Member B',imageUrl:null,blockedAt:'2026-09-13T12:00:00Z'}]);
  await api.unblock('member-b');
  const removal=calls.find(call=>call.table==='community_blocks'&&call.operations.some(op=>op.method==='delete'));
  assert.ok(removal.operations.some(op=>op.method==='eq'&&op.args[0]==='blocker_id'&&op.args[1]==='current-member'));
  assert.ok(removal.operations.some(op=>op.method==='eq'&&op.args[0]==='blocked_profile_id'&&op.args[1]==='member-b'));
});
test('the client rejects self-block and cannot report a block as saved without server acknowledgement', async () => {
  const self=fakeClient();
  await assert.rejects(()=>self.api.block('current-member'),/cannot block yourself/); assert.equal(self.calls.length,0);
  const missing=fakeClient({community_blocks:{data:null,error:null}});
  await assert.rejects(()=>missing.api.block('member-b'),/not confirmed/);
});
test('successful blocking can immediately evict the blocked author from the current feed', () => {
  const feed=[{id:'1',author_id:'blocked-member'},{id:'2',author_id:'visible-member'}];
  assert.deepEqual(removeCommunityPageItems(feed,item=>item.author_id==='blocked-member'),[{id:'2',author_id:'visible-member'}]);
  assert.equal(feed.length,2,'feed invalidation does not mutate the existing page');
});
test('a successful reply immediately increments only its cached conversation summary', () => {
  const feed=[{id:'replied-to',reply_count:0},{id:'other',reply_count:4}];
  const updated=updateCommunityPageItem(feed,'replied-to',post=>({...post,reply_count:post.reply_count+1}));
  assert.deepEqual(updated,[{id:'replied-to',reply_count:1},{id:'other',reply_count:4}]);
  assert.equal(feed[0].reply_count,0,'the authoritative page remains independently replaceable on refresh');
  const detail=readFileSync(new URL('../src/features/community/community-detail.tsx',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../src/features/community/community-screen.tsx',import.meta.url),'utf8');
  assert.match(detail,/await api\.reply[\s\S]*onReplyCreated\(id\)[\s\S]*await replies\.refresh\(\)[\s\S]*setPost\(await api\.post\(id\)\)/);
  assert.match(screen,/feed\.updateItem\(id,[\s\S]*reply_count: post\.reply_count \+ 1/);
});
test('page append de-duplicates and initials/participation notices are safe for long names', () => {
  assert.deepEqual(appendCommunityPage([{id:'1'}],[{id:'1'},{id:'2'}]),[{id:'1'},{id:'2'}]);
  assert.equal(communityInitials('A Very Long Name'),'AV');
  assert.match(participationMessage({restricted:true}),/report concerns/);
});
test('deleted Community posts use the neutral deleted-profile icon instead of initials', () => {
  const avatar = readFileSync(new URL('../src/components/vital/profile-avatar.tsx', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../src/features/community/community-screen.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/features/community/community-detail.tsx', import.meta.url), 'utf8');
  assert.match(avatar, /deleted \? <Ionicons testID="profile-avatar-deleted" name="person-outline"/);
  assert.match(feed, /deleted=\{!post\.author_id\}/);
  assert.match(detail, /deleted=\{!post\.author_id\}/);
});

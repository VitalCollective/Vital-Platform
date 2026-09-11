import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityApi } from '../src/features/community/community-api.ts';
import { appendCommunityPage, communityInitials, participationMessage, validatePostDraft, validateReply } from '../src/features/community/community-model.ts';

function fakeClient(responses = {}) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'current-member' } } }, error: null }) },
    rpc(name, args) { calls.push({ name, args }); return Promise.resolve(responses[name] ?? { data: { items: [], hasMore: false, nextOffset: 20 }, error: null }); },
    from(table) {
      const call = { table, operations: [] }; calls.push(call);
      const builder = { then(resolve) { return Promise.resolve(responses[table] ?? { data: { id: 'created-post' }, error: null }).then(resolve); } };
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
  await api.report({type:'post',id:'p',authorId:'someone'},'spam_scam','Promotional concern');
  assert.equal(calls[0].operations[0].args[0].reason_category,'spam_scam');
  assert.equal(calls.length,1);
});
test('page append de-duplicates and initials/participation notices are safe for long names', () => {
  assert.deepEqual(appendCommunityPage([{id:'1'}],[{id:'1'},{id:'2'}]),[{id:'1'},{id:'2'}]);
  assert.equal(communityInitials('A Very Long Name'),'AV');
  assert.match(participationMessage({restricted:true}),/report concerns/);
});

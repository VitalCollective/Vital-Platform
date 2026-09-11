import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarImageVisible, createProfileImageResolver, profileImagePath, profileInitials } from '../src/lib/profile-images.ts';
import { createCommunityApi } from '../src/features/community/community-api.ts';
import { STARTER_DISCLOSURE } from '../src/features/community/community-model.ts';

const real='40000000-0000-4000-8000-000000000001',seed='40000000-0000-4000-8000-000000000002';
const path=id=>`${id}/portrait-v1.webp`;
const profile=(id,is_seeded=false)=>({id,display_name:is_seeded?'Starter name':'Member name',avatar_url:`profile-images/${path(id)}`,is_seeded});
function storageClient(result) {
  const calls=[];
  return {calls,storage:{from(bucket){assert.equal(bucket,'profile-images');return {
    async createSignedUrls(paths,seconds){calls.push({paths,seconds});return result ? result(paths) : {data:paths.map(path=>({path,signedUrl:`https://storage.test/${path}`})),error:null};},
  };}}};
}

test('durable image references require the matching profile folder and safe image filename',()=>{
  assert.equal(profileImagePath(profile(real).avatar_url,real),path(real));
  for(const ref of [null,'',`https://example.com/${path(real)}`,`profile-images/${path(seed)}`,`profile-images/${real}/../portrait.webp`,`profile-images/${real}/p.svg`,`profile-images/${real}/p.gif`,`profile-images/${real}/p.png?token=secret`,`data:image/png;base64,abc`,`C:\\Downloads\\photo.png`])assert.equal(profileImagePath(ref,real),null);
});

test('initials and failed-image state provide the same stable fallback for every profile',()=>{
  assert.equal(profileInitials('  Anna    Jones '),'AJ');
  assert.equal(profileInitials('LongUnbrokenName'),'L');
  assert.equal(profileInitials('Élodie Smith'),'ÉS');
  assert.equal(profileInitials(''),'V');
  assert.equal(avatarImageVisible(null,null),false);
  assert.equal(avatarImageVisible('image-a',null),true);
  assert.equal(avatarImageVisible('image-a','image-a'),false);
  assert.equal(avatarImageVisible('image-b','image-a'),true);
});

test('real and seed images share one deduplicated batch, cache and expiry; absent images make no request',async()=>{
  const client=storageClient(),resolve=createProfileImageResolver(client);
  assert.deepEqual([...await resolve([{id:real,avatar_url:null}],0)],[[real,null]]);
  assert.equal(client.calls.length,0);
  const rows=[profile(real),profile(seed,true),profile(real)];
  const images=await resolve(rows,0);
  assert.equal(images.size,2);assert.ok(images.get(real));assert.ok(images.get(seed));
  assert.deepEqual(client.calls,[{paths:[path(real),path(seed)],seconds:3600}]);
  await resolve(rows,54*60_000);assert.equal(client.calls.length,1);
  await resolve(rows,55*60_000);assert.equal(client.calls.length,2);
});

test('unavailable, partial and thrown signing responses fall back without hiding successful images',async()=>{
  const partial=storageClient(paths=>({data:[{path:paths[0],signedUrl:'https://storage.test/ok'},{path:paths[1],error:'not found'}],error:null}));
  const resolve=createProfileImageResolver(partial),rows=[profile(real),profile(seed,true)];
  assert.deepEqual([...await resolve(rows,0)],[[real,'https://storage.test/ok'],[seed,null]]);
  await resolve(rows,29_999);assert.equal(partial.calls.length,1);
  await resolve(rows,30_000);assert.equal(partial.calls.length,2);assert.deepEqual(partial.calls[1].paths,[path(seed)]);
  for(const result of [()=>({data:null,error:{message:'Storage backend detail'}}),()=>{throw new Error('Network detail');}]) {
    const client=storageClient(result),images=await createProfileImageResolver(client)(rows);
    assert.deepEqual([...images],[[real,null],[seed,null]]);
  }
});

test('image cache remains bounded rather than retaining an unbounded community directory',async()=>{
  const client=storageClient(),resolve=createProfileImageResolver(client);
  const ids=Array.from({length:129},(_,i)=>`40000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
  for(let offset=0;offset<ids.length;offset+=20)await resolve(ids.slice(offset,offset+20).map(id=>profile(id)),0);
  const before=client.calls.length;
  await resolve([profile(ids[0])],1);assert.equal(client.calls.length,before+1);
});

function apiFixture(directoryError=false) {
  const client=storageClient(),calls=[];
  const post={id:'post',author_id:seed,author_name:'Starter name',body:'Complete content',is_seeded:true};
  const reply={id:'reply',author_id:real,author_name:'Member name',body:'Complete reply',is_seeded:false};
  const responses={profiles:{data:[profile(real),profile(seed,true)],error:directoryError?{message:'backend detail'}:null},community_post_catalogue:{data:post},community_posts:{data:[post]},community_comments:{data:[reply]},community_reports:{data:[{id:'report',target_type:'comment',target_id:'reply'}]}};
  client.rpc=async name=>({data:{items:[name==='community_reply_page'?reply:post],hasMore:false,nextOffset:20},error:null});
  client.from=table=>{
    calls.push(table);let single=false,ids=null;
    const query={then(resolve){let r=responses[table];if(table==='profiles'&&ids)r={...r,data:r.data.filter(p=>ids.includes(p.id))};return Promise.resolve(single&&Array.isArray(r.data)?{...r,data:r.data[0]}:r).then(resolve);}};
    for(const method of ['select','eq','order','range'])query[method]=()=>query;
    query.in=(column,values)=>{ids=values;return query;};
    query.maybeSingle=()=>{single=true;return query;};return query;
  };
  return {api:createCommunityApi(client),client,calls};
}

test('feed, full post, replies and moderator references use the same optional image path and preserve content',async()=>{
  const {api,client,calls}=apiFixture();
  const feed=await api.posts({search:'',topic:null,postType:null,order:'recent'});
  assert.ok(feed.items[0].author_image_url);assert.equal(feed.items[0].author_is_seeded,true);
  const detail=await api.post('post');assert.equal(detail.body,'Complete content');assert.equal(detail.author_image_url,feed.items[0].author_image_url);
  const replies=await api.replies('post');assert.ok(replies.items[0].author_image_url);assert.equal(replies.items[0].author_is_seeded,false);
  const reports=await api.reportQueue();assert.equal(reports.items[0].target.body,'Complete reply');assert.equal(reports.items[0].target.author_image_url,replies.items[0].author_image_url);
  assert.equal(client.calls.length,2);assert.equal(calls.filter(t=>t==='profiles').length,4);
});

test('optional directory failure keeps posts and replies available with existing author names',async()=>{
  const {api,client}=apiFixture(true);
  const feed=await api.posts({search:'',topic:null,postType:null,order:'recent'});
  assert.equal(feed.items[0].author_name,'Starter name');assert.equal(feed.items[0].author_image_url,undefined);
  assert.equal((await api.replies('post')).items[0].body,'Complete reply');assert.equal(client.calls.length,0);
});

test('About Community uses exactly the approved two-paragraph starter disclosure',()=>{
  assert.deepEqual(STARTER_DISCLOSURE,[
    'To help get Community going, Vital created some starter profiles and conversations showing the kinds of questions, ideas and experiences people can share here. As the community grows, conversations from members will naturally take their place.',
    'Some starter profiles use generated profile images.',
  ]);
});

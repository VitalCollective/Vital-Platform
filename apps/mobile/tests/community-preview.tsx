// Isolated visual QA entry. Not an Expo Router route and never imported by app
// code. All fixture writes stay in memory; no Supabase client is constructed.
import React from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { CommunityScreenContent } from '../src/features/community/community-screen';
import { ProfileAvatar } from '../src/components/vital/profile-avatar';
import type { CommunityApi } from '../src/features/community/community-api';
import type { CommunityPostDetail, CommunityReply } from '../src/features/community/community-model';

const mode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('state') : null;
// Existing brand artwork is a rendering probe, not a generated portrait or seed asset.
const probeImage = 'http://127.0.0.1:8092/qa-avatar.png';
const brokenImage = 'http://127.0.0.1:8092/qa-avatar-missing.png';
const body = 'TEST FIXTURE. Long community content should wrap naturally on a phone. '.repeat(14) + 'END OF COMPLETE TEST CONTENT.';
const posts: CommunityPostDetail[] = Array.from({length:24}, (_,i) => ({
  id:`fixture-${i}`,author_id:i===1?'qa-self':'qa-other',author_name:i===0?'LongUnbrokenUsernameForMobileWrappingVerification':'Fixture member',
  author_image_url:i<2?probeImage:i===3?brokenImage:null,
  author_is_seeded:i===0,title:i===0?'TEST: A longer question about what worked for your family on an ordinary afternoon':'TEST fixture conversation '+(i+1),
  excerpt:body.slice(0,320),body,post_type:'question',topic:i%2?'Food':'Kids',tags:[],activity_id:i===0?'TEST-ACTIVITY':null,
  activity_title:i===0?'TEST linked Vital activity':null,is_seeded:i===0,locked:false,pinned:false,created_at:'2026-01-10T12:00:00Z',updated_at:'2026-01-10T12:00:00Z',
  helpful_count:2,reply_count:1,viewer_helpful:mode==='restricted',moderation_status:'visible',
}));
const replies: CommunityReply[]=[{id:'fixture-reply',post_id:'fixture-0',author_id:'qa-other',author_name:'AnotherLongUnbrokenUsernameForWrapping',body,created_at:'2026-01-11T12:00:00Z',is_seeded:false,parent_comment_id:null,reply_to_name:null,helpful_count:1,viewer_helpful:false}];
replies[0].author_image_url=probeImage;
replies.push({...replies[0],id:'fixture-reply-absent',author_name:'Initials member',body:'TEST image absent',author_image_url:null});
replies.push({...replies[0],id:'fixture-reply-broken',author_name:'Broken image member',body:'TEST broken image',author_image_url:brokenImage,is_seeded:true});
const access = {canParticipate:mode!=='rules'&&mode!=='restricted',restricted:mode==='restricted',acceptedRules:mode!=='rules',isModerator:mode==='moderator',rules:{version:2,title:'Community Rules · QA',content_markdown:'TEST RULES. No advertisements, promotional posts, affiliate spam, repeated self-promotion or commercial solicitation. Respect privacy and keep children safe.'}};
const api: CommunityApi = {
  async access(){return access;},
  async posts(filters,offset=0){if(mode==='error')throw new Error('TEST backend detail must not reach customer UI');const rows=mode==='empty'?[]:posts.filter(p=>(!filters.topic||p.topic===filters.topic)&&(!filters.postType||p.post_type===filters.postType)&&(!filters.search||p.title.toLowerCase().includes(filters.search.toLowerCase())));return {items:rows.slice(offset,offset+20),hasMore:rows.length>offset+20,nextOffset:offset+20};},
  async post(id){return posts.find(p=>p.id===id)!;},
  async replies(id,offset=0){const rows=replies.filter(r=>r.post_id===id);return {items:rows.slice(offset,offset+20),hasMore:rows.length>offset+20,nextOffset:offset+20};},
  async createPost(draft){const p={...posts[0],id:'new-fixture',title:draft.title,body:draft.body,excerpt:draft.body,post_type:draft.postType,topic:draft.topic,author_id:'qa-self',author_name:'QA member',is_seeded:false,author_is_seeded:false,activity_id:draft.activityId,activity_title:draft.activityId?'TEST linked Vital activity':null,helpful_count:0,reply_count:0,viewer_helpful:false};posts.unshift(p);return p.id;},
  async reply(id,content,parent){replies.push({...replies[0],id:'new-fixture-reply',post_id:id,body:content,parent_comment_id:parent,author_name:'QA member',author_id:'qa-self'});},
  async helpful(kind,id,remove){const item=kind==='post'?posts.find(p=>p.id===id):replies.find(r=>r.id===id);if(item){item.viewer_helpful=!remove;item.helpful_count+=remove?-1:1;}},
  async report(){}, async block(){}, async acceptRules(){access.acceptedRules=true;access.canParticipate=!access.restricted;},
  async findActivities(){return [{id:'TEST-ACTIVITY',title:'TEST linked Vital activity',section:'Vital Kids'}];},
  async moderate(){},async removeOwn(){},
  async reportQueue(){return {items:[{id:'test-report',target_type:'post',target_id:'fixture-0',reason_category:'spam_scam',details:'TEST report concern',status:'open',created_at:'2026-01-12T00:00:00Z',target:{author_id:'qa-other',author_name:posts[0].author_name,author_image_url:probeImage,author_is_seeded:true,created_at:posts[0].created_at,title:'TEST reported post',body,moderation_status:'visible'}}],hasMore:false,nextOffset:20};},
  async resolveReport(){},async restrict(){},async restrictions(){return [];},async revoke(){},
};
function Preview(){
  const [fonts] = useFonts({DMSerifDisplay_400Regular,Inter_400Regular,Inter_500Medium,Inter_600SemiBold,Inter_700Bold});
  if(!fonts)return null;
  if(mode==='avatars')return <SafeAreaProvider><View style={{padding:20,gap:24,backgroundColor:'#FDF5E7',flex:1}}><Text>Local avatar rendering probes · existing artwork only</Text>{[
    ['Genuine member image',probeImage],['Starter profile image',probeImage],['Image absent',null],['Unavailable image',brokenImage],
  ].map(([name,imageUrl])=><View key={name!} style={{flexDirection:'row',alignItems:'center',gap:12}}><ProfileAvatar name={name!} imageUrl={imageUrl} size={54}/><Text style={{flex:1,minWidth:0}}>{name}</Text></View>)}</View></SafeAreaProvider>;
  return <SafeAreaProvider><View style={{flex:1}}><Text style={{padding:8,backgroundColor:'#E8EDE6',color:'#344834',fontSize:12}}>Isolated Community QA · local fixtures only</Text><CommunityScreenContent api={api} userId="qa-self" onActivity={()=>alert('QA: linked activity navigation invoked')} /></View></SafeAreaProvider>;
}
registerRootComponent(Preview);

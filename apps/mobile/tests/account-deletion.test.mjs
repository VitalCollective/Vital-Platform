import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AccountDeletionError, createAccountApi } from '../src/features/account/account-api.ts';
import { createDeleteAccountHandler, DeletionProblem, RECENT_SIGN_IN_WINDOW_MS } from '../../../supabase/functions/delete-account/handler.ts';

const now = Date.parse('2026-09-13T18:00:00Z');
function dependencies(overrides = {}) {
  const calls = [];
  return { calls, value: {
    now: () => now,
    verifyUser: async token => { calls.push(['verify',token]); return { id:'member-a',lastSignInAt:new Date(now-60000).toISOString() }; },
    getManifest: async token => { calls.push(['manifest',token]); return { profile_id:'member-a',avatar_reference:'profile-images/member-a/avatar.webp' }; },
    listAvatarObjects: async id => { calls.push(['list',id]); return ['member-a/avatar.webp']; },
    removeAvatarObjects: async paths => { calls.push(['remove',paths]); },
    authorizeDeletion: async id => { calls.push(['authorize',id]); },
    clearDeletionAuthorization: async id => { calls.push(['clear-authorization',id]); },
    deleteAuthUser: async id => { calls.push(['delete',id]); },
    ...overrides,
  } };
}
function request(body = { confirmation:'DELETE' }) {
  return new Request('https://example.invalid/delete-account', { method:'POST',headers:{Authorization:'Bearer member-token','Content-Type':'application/json'},body:JSON.stringify(body) });
}

test('server derives one verified member identity and removes avatars before hard Auth deletion', async () => {
  const fixture=dependencies();
  const response=await createDeleteAccountHandler(fixture.value)(request({confirmation:'DELETE',profileId:'victim-id'}));
  assert.equal(response.status,200); assert.deepEqual(await response.json(),{deleted:true});
  assert.deepEqual(fixture.calls,[['verify','member-token'],['manifest','member-token'],['list','member-a'],['remove',['member-a/avatar.webp']],['authorize','member-a'],['delete','member-a']]);
});
test('confirmation, authenticated identity and recent sign-in are required before side effects', async () => {
  for (const [candidate,overrides,status] of [
    [{confirmation:'delete'}, {}, 400],
    [{confirmation:'DELETE'}, {verifyUser:async()=>null}, 401],
    [{confirmation:'DELETE'}, {verifyUser:async()=>({id:'member-a',lastSignInAt:new Date(now-RECENT_SIGN_IN_WINDOW_MS-1).toISOString()})}, 403],
    [{confirmation:'DELETE'}, {getManifest:async()=>{throw new DeletionProblem('not_genuine_member',403,'Not available.');}}, 403],
  ]) {
    const fixture=dependencies(overrides); const response=await createDeleteAccountHandler(fixture.value)(request(candidate));
    assert.equal(response.status,status); assert.equal((await response.json()).deleted,false);
    assert.equal(fixture.calls.some(call=>call[0]==='delete'),false);
  }
});
test('storage or Auth failure never returns a false deletion success', async () => {
  const storage=dependencies({removeAvatarObjects:async()=>{throw new DeletionProblem('avatar_cleanup_failed',500,'Unable.');}});
  const storageResponse=await createDeleteAccountHandler(storage.value)(request());
  assert.equal(storageResponse.status,500); assert.equal((await storageResponse.json()).deleted,false);
  assert.equal(storage.calls.some(call=>call[0]==='delete'),false);
  let deletionAttempted=false;
  const auth=dependencies({deleteAuthUser:async()=>{deletionAttempted=true;throw new DeletionProblem('deletion_failed',500,'Unable.');}});
  const authResponse=await createDeleteAccountHandler(auth.value)(request());
  assert.equal(authResponse.status,500); assert.equal((await authResponse.json()).deleted,false);
  assert.equal(deletionAttempted,true);
  assert.deepEqual(auth.calls.slice(-2),[['authorize','member-a'],['clear-authorization','member-a']]);
});
test('mobile API sends no selectable user ID and acknowledges only confirmed server deletion', async () => {
  const calls=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'member-a'}}},error:null})},functions:{invoke:async(name,options)=>{calls.push({name,options});return {data:{deleted:true},error:null};}}};
  const api=createAccountApi(client);
  await api.deleteAccount('member-a','DELETE');
  assert.deepEqual(calls,[{name:'delete-account',options:{body:{confirmation:'DELETE'}}}]);
  await assert.rejects(()=>api.deleteAccount('member-b','DELETE'),/session changed/);
  await assert.rejects(()=>api.deleteAccount('member-a','delete'),AccountDeletionError);
});
test('mobile API exposes safe re-auth guidance and never accepts an unconfirmed response', async () => {
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'member-a'}}},error:null})},functions:{invoke:async()=>({data:null,error:{context:new Response(JSON.stringify({code:'recent_auth_required'}))}})}};
  await assert.rejects(()=>createAccountApi(client).deleteAccount('member-a','DELETE'),/sign out and sign in again/);
  client.functions.invoke=async()=>({data:{deleted:false},error:null});
  await assert.rejects(()=>createAccountApi(client).deleteAccount('member-a','DELETE'),/couldn't confirm/);
});
test('You deletion UI is deliberate, typed, subscription-aware and signs out only after server success', () => {
  const screen=readFileSync(new URL('../src/features/account/account-screen.tsx',import.meta.url),'utf8');
  assert.match(screen,/Continue to deletion/); assert.match(screen,/Type DELETE to confirm/);
  assert.match(screen,/Delete account permanently/); assert.match(screen,/confirmation !== 'DELETE'/);
  assert.match(screen,/Deleting your Vital account does not cancel your App Store or Google Play subscription\./);
  assert.match(screen,/billingAcknowledged/); assert.match(screen,/Manage subscription/);
  assert.match(screen,/await api\.deleteAccount\(id, confirmation\);[\s\S]*await signOut\(\)/);
});

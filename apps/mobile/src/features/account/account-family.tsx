import { useCallback, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { CommunityAction, CommunityField, CommunityNotice } from '@/features/community/community-ui';
import { customerSafeErrorMessage } from '@/lib/errors';
import type { AccountApi } from './account-api';
import {
  FAMILY_RELATIONSHIPS, familyMemberValidation, parseFamilyAge,
  type Family, type FamilyMember, type FamilyRelationship,
} from './account-model';
import { a, AccountLoadState, Group, useAccountLoad } from './account-ui';

function memberName(member: FamilyMember): string {
  return member.display_name || member.relationship;
}

function FamilyMemberEditor({ api, accountId, member, onCancel, onSaved }: {
  api: AccountApi; accountId: string; member: FamilyMember | null;
  onCancel: () => void; onSaved: (member: FamilyMember) => void;
}) {
  const [name, setName] = useState(member?.display_name ?? '');
  const [relationship, setRelationship] = useState<FamilyRelationship>(member?.relationship ?? 'Child');
  const [age, setAge] = useState(member ? String(member.age_years) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    const invalid = familyMemberValidation(name, relationship, age);
    setError(invalid);
    if (invalid) return;
    const ageYears = parseFamilyAge(age);
    if (ageYears === null) return;
    setBusy(true);
    try {
      const input = { displayName: name, relationship, ageYears };
      const saved = member
        ? await api.updateFamilyMember(accountId, member.id, input)
        : await api.addFamilyMember(accountId, input);
      Keyboard.dismiss(); onSaved(saved);
    } catch (cause) {
      setError(customerSafeErrorMessage('Save family member', cause, "We couldn't save this family member. Please try again."));
    } finally { setBusy(false); }
  }
  return <Group title={member ? `Edit ${memberName(member)}` : 'Add a family member'}>
    <Text style={a.meta}>Keep this private and simple. A first name or nickname is optional; Vital does not need a surname or date of birth.</Text>
    <CommunityField label="Name or nickname · optional" value={name} onChangeText={(value) => { setName(value); setError(null); }}
      editable={!busy} maxLength={60} autoCapitalize="words" autoCorrect={false} />
    <Text style={a.label}>Relationship</Text>
    <View style={a.wrap}>{FAMILY_RELATIONSHIPS.map(value => <FilterChip key={value} label={value} selected={relationship === value}
      onPress={() => { setRelationship(value); setError(null); }} />)}</View>
    <CommunityField label="Current age in whole years" value={age} onChangeText={(value) => { setAge(value); setError(null); }}
      editable={!busy} maxLength={3} keyboardType="number-pad" inputMode="numeric" autoCorrect={false} />
    <Text style={a.meta}>We store the age you enter, not a date of birth. The confirmation date is recorded so Vital can ask you to check it again later.</Text>
    <CommunityNotice message={error} error />
    <Button label={member ? 'Save changes' : 'Add family member'} loading={busy} onPress={() => void save()} />
    <Button label="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
  </Group>;
}

export function AccountFamily({ api, id }: { api: AccountApi; id: string }) {
  const state = useAccountLoad(useCallback(() => api.families(id), [api, id]));
  const [editing, setEditing] = useState<FamilyMember | 'new' | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const families = state.value ?? [];
  const members = families.flatMap(family => family.members);
  function saveLocal(saved: FamilyMember) {
    const current = state.value ?? [];
    const hasFamily = current.some(family => family.id === saved.family_id);
    const next: Family[] = hasFamily ? current.map(family => family.id !== saved.family_id ? family : {
      ...family, members: family.members.some(member => member.id === saved.id)
        ? family.members.map(member => member.id === saved.id ? saved : member)
        : [...family.members, saved],
    }) : [...current, { id: saved.family_id, name: 'Our Family', members: [saved] }];
    state.commit(next); setEditing(null); setNotice('Your family details have been saved.');
  }
  async function remove() {
    if (!removing || removingBusy) return;
    setRemovingBusy(true); setRemoveError(null);
    try {
      await api.removeFamilyMember(id, removing.id);
      state.commit(families.map(family => ({ ...family, members: family.members.filter(member => member.id !== removing.id) })));
      setRemoving(null); setNotice('The family member has been removed.');
    } catch (cause) {
      setRemoveError(customerSafeErrorMessage('Remove family member', cause, "We couldn't remove this family member. Please try again."));
    } finally { setRemovingBusy(false); }
  }
  return <View style={a.stack}>
    <AccountLoadState state={state} />
    {!state.loading && !state.error && <>
      <Text style={a.body}>Private family details help prepare Vital to suggest age-appropriate ideas later. They are never part of your Community profile.</Text>
      <CommunityNotice message={notice} />
      {editing && <FamilyMemberEditor key={editing === 'new' ? 'new' : editing.id} api={api} accountId={id}
        member={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={saveLocal} />}
      {removing && <Group title={`Remove ${memberName(removing)}?`}>
        <Text style={a.body}>This permanently removes only this family member’s private record. It does not affect your Vital account or anyone else in your family.</Text>
        <CommunityNotice message={removeError} error />
        <Button label="Remove family member" variant="danger" loading={removingBusy} onPress={() => void remove()} />
        <Button label="Keep family member" variant="secondary" disabled={removingBusy} onPress={() => { setRemoving(null); setRemoveError(null); }} />
      </Group>}
      <Group title="Your family">
        {members.length ? members.map(member => <View key={member.id} style={a.rule}>
          <Text style={a.label}>{memberName(member)}</Text>
          <Text style={a.meta}>{member.relationship} · Age {member.age_years}</Text>
          <View style={a.wrap}><CommunityAction label={`Edit ${memberName(member)}`} icon="pencil-outline" onPress={() => { setEditing(member); setRemoving(null); setNotice(null); }} />
            <CommunityAction label={`Remove ${memberName(member)}`} icon="trash-outline" onPress={() => { setRemoving(member); setEditing(null); setNotice(null); setRemoveError(null); }} /></View>
        </View>) : <><Text style={a.body}>No family members added yet.</Text><Text style={a.meta}>Add only the people whose age and relationship will help tailor family activity ideas.</Text></>}
        {!editing && !removing && <Button label="Add a family member" onPress={() => { setEditing('new'); setNotice(null); }} />}
      </Group>
    </>}
  </View>;
}

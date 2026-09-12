import { useAuth } from '@/features/auth/auth-context';
import { SavedActivitiesScreen } from '@/features/saved/saved-activities-screen';

export default function SavedScreen() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null; // The existing navigator owns the auth gate.
  return <SavedActivitiesScreen key={user.id} profileId={user.id} />;
}

import { ShellScreen } from '@/components/vital/shell-screen';

export default function SavedScreen() {
  return (
    <ShellScreen
      title="Saved"
      description="Your place for ideas to try later, plans already made and activities worth remembering."
      note="Favourites, Try Later and Completed will live here once the saving flow joins this slice."
      icon="bookmark-outline"
    />
  );
}

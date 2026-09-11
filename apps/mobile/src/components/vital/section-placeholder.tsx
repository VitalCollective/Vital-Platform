import { Screen, ScreenHeader } from '@/components/vital/screen';

export function SectionPlaceholder({ title, sentence }: { title: string; sentence: string }) {
  return (
    <Screen>
      <ScreenHeader eyebrow="Vital Collective" title={title} description={sentence} />
    </Screen>
  );
}

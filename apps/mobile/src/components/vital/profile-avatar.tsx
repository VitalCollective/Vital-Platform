import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { avatarImageVisible, profileInitials } from '@/lib/profile-images';
import { colors, typography } from '@/theme/tokens';

// One rendering path for genuine and starter profiles. The enclosing fixed-size
// circle never changes layout while loading, failing, or recycling a list item.
export function ProfileAvatar({ name, imageUrl, size = 38, decorative = true }: {
  name: string; imageUrl?: string | null; size?: number; decorative?: boolean;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  return <View testID="profile-avatar" accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'} aria-hidden={decorative}
    accessibilityLabel={decorative ? undefined : `Profile image for ${name.trim() || 'Vital Member'}`}
    accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text testID="profile-avatar-initials" style={[styles.initials, { fontSize: size >= 50 ? 20 : typography.small }]}>{profileInitials(name)}</Text>
    {avatarImageVisible(imageUrl, failedUri) && <Image key={imageUrl} testID="profile-avatar-image" source={{ uri: imageUrl! }}
      accessible={false} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" recyclingKey={imageUrl}
      transition={0} onLoad={() => setLoadedUri(imageUrl!)} onError={() => { setFailedUri(imageUrl!); setLoadedUri(null); }}
      style={[StyleSheet.absoluteFill, { opacity: loadedUri === imageUrl ? 1 : 0 }]} />}
  </View>;
}
const styles = StyleSheet.create({
  circle: { flexShrink: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  initials: { color: colors.brand, fontFamily: typography.bodyBoldFamily },
});

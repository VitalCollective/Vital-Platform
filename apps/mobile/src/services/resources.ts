import * as Linking from 'expo-linking';

import { requireSupabase } from '@/lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 10 * 60;

export async function openPrintableResource(storagePath: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.storage
    .from('vital-resources')
    .createSignedUrl(storagePath, SIGNED_URL_LIFETIME_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Unable to prepare this printable resource: ${error?.message ?? 'No signed URL was returned.'}`,
    );
  }

  try {
    await Linking.openURL(data.signedUrl);
  } catch {
    throw new Error('The PDF was prepared, but this device could not open it.');
  }
}

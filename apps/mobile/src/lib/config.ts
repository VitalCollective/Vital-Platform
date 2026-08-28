const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const configurationIssues: string[] = [];

if (!supabaseUrl) {
  configurationIssues.push('EXPO_PUBLIC_SUPABASE_URL is missing');
} else if (
  !/^https?:\/\/[^\s/]+/i.test(supabaseUrl) ||
  supabaseUrl.includes('your-project-ref')
) {
  configurationIssues.push('EXPO_PUBLIC_SUPABASE_URL is not a valid project URL');
}

if (!supabasePublishableKey) {
  configurationIssues.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing');
} else if (!supabasePublishableKey.startsWith('sb_publishable_')) {
  configurationIssues.push(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a public publishable key',
  );
}

export const mobileConfig =
  configurationIssues.length === 0 && supabaseUrl && supabasePublishableKey
    ? {
        isValid: true as const,
        supabaseUrl,
        supabasePublishableKey,
        error: null,
      }
    : {
        isValid: false as const,
        supabaseUrl: null,
        supabasePublishableKey: null,
        error: `Mobile configuration error: ${configurationIssues.join('; ')}. Copy .env.example to .env and add the public Supabase values.`,
      };

export const SITE = {
  name: 'Vital Collective',
  origin: 'https://vitalcollective.co.uk',
  email: 'info@vitalcollective.co.uk',
  description:
    'Practical activities, printable resources and a supportive community to help families move, play, connect and make everyday life better.',
  address: [
    'Vital Collective',
    'Unit 1, The Breeze Hill, Bangor Road',
    'Benllech',
    'Anglesey',
    'LL74 8TN',
  ],
};

export const NAVIGATION = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'how-it-works', label: 'How it works', href: '/how-it-works/' },
  { key: 'membership', label: 'Membership', href: '/membership/' },
  { key: 'about', label: 'About', href: '/about/' },
  { key: 'faq', label: 'FAQ', href: '/faq/' },
];

export const VITAL_AREAS = [
  {
    number: '01',
    title: 'Vital Mums',
    description: 'Practical care, perspective and space for the grown-ups.',
    tone: 'plum',
  },
  {
    number: '02',
    title: 'Vital Kids',
    description: 'Play, make, learn and follow their curiosity.',
    tone: 'green',
  },
  {
    number: '03',
    title: 'Vital Together',
    description: 'Shared rituals, adventures and time that feels well spent.',
    tone: 'plum',
  },
  {
    number: '04',
    title: 'Vital Life',
    description: 'Everyday skills, confidence and capability for family life.',
    tone: 'green',
  },
  {
    number: '05',
    title: 'Vital Food',
    description: 'Cook, taste, grow and understand what is on the table.',
    tone: 'plum',
  },
];

export const CORE_BENEFITS = [
  {
    title: 'Hundreds of practical activities',
    text: 'Useful ideas for real family days—not an endless feed to scroll.',
  },
  {
    title: 'Printable resources',
    text: 'Supporting materials that help an idea move naturally away from the screen.',
  },
  {
    title: 'Ideas for the right ages',
    text: 'Family ages and preferences help make activity discovery more relevant.',
  },
  {
    title: 'Save what works',
    text: 'Keep useful activities close by and return to them when the moment is right.',
  },
  {
    title: 'Supportive Community',
    text: 'A moderated member space for thoughtful conversations and shared experience.',
  },
  {
    title: 'Family profiles and preferences',
    text: 'Keep simple age, relationship and interest details together to support more useful discovery.',
  },
];

export const HOW_IT_WORKS = [
  {
    number: '01',
    title: 'Tell Vital what would help',
    text: 'Search the collection or use straightforward filters for ages, settings and the part of family life you want to explore.',
  },
  {
    number: '02',
    title: 'Choose a practical idea',
    text: 'Each activity is written to be understandable and usable, with equipment, age guidance and instructions where needed.',
  },
  {
    number: '03',
    title: 'Put the phone down and do it',
    text: 'Vital is designed to help families move from looking to doing, rather than keeping everyone inside another screen.',
  },
  {
    number: '04',
    title: 'Save the good ones',
    text: 'Keep activities that fit your family so they are easy to find again on a busy day.',
  },
];

export const APP_FEATURES = [
  {
    title: 'Discover',
    text: 'Search and filter across the complete Vital activity collection.',
  },
  {
    title: 'Activities and resources',
    text: 'Clear activity detail plus printable resources where an idea needs something extra.',
  },
  {
    title: 'Age-aware ideas',
    text: 'Optional, privacy-minimised family profiles help keep ages and activity interests together.',
  },
  {
    title: 'Saved',
    text: 'A compact personal collection of activities you want to return to.',
  },
  {
    title: 'Community',
    text: 'A member space with reporting, blocking and moderation built in.',
  },
  {
    title: 'Your family',
    text: 'Keep only a nickname, relationship and current age—never a child login or date of birth.',
  },
];

export const MEMBERSHIP_BENEFITS = [
  'The complete Vital activity collection',
  'All five Vital areas',
  'Printable resources',
  'Search, filters and Saved activities',
  'Family profiles and preferences',
  'The moderated Vital Community',
];

export const ABOUT_PRINCIPLES = [
  {
    title: 'Practical over perfect',
    text: 'Ideas should be realistic enough to use in ordinary family life.',
  },
  {
    title: 'Less searching, more doing',
    text: 'Vital should shorten the distance between wanting an idea and getting started.',
  },
  {
    title: 'Family information kept proportionate',
    text: 'Personalisation should not require more information about a family than the feature genuinely needs.',
  },
  {
    title: 'Warm, moderated connection',
    text: 'Community is designed to be supportive, with clear rules and practical safety tools.',
  },
];

export const FAQ_GROUPS = [
  { title: 'About Vital', from: 1, to: 9 },
  { title: 'Community', from: 10, to: 16 },
  { title: 'Membership and your account', from: 17, to: 24 },
  { title: 'Safety, suggestions and privacy', from: 25, to: 30 },
];

export const ACCOUNT_DELETION = {
  title: 'Delete your Vital account',
  description:
    'How to permanently delete a Vital Collective account and associated personal data, including what to do if you cannot access the app.',
  summary:
    'Vital Collective members can permanently delete their account and associated personal data from inside the Vital app. You can also request deletion without signing in or installing Vital.',
  sections: [
    {
      heading: 'Delete your account in the app',
      steps: [
        'Open Vital and sign in.',
        'Choose You from the bottom navigation.',
        'Under Account, choose Delete account.',
        'Review the information shown, type DELETE, then choose Delete account permanently.',
      ],
      paragraphs: [
        'This action is permanent. Vital may ask you to sign in again if your session is no longer recent enough to confirm this sensitive action safely.',
      ],
    },
    {
      heading: 'Cannot access the app?',
      tone: 'accent',
      paragraphs: [
        'Email info@vitalcollective.co.uk to request permanent deletion. If possible, send the request from the email address used for your Vital account. We may need to verify your identity before acting.',
        'Never send us your password, payment-card details or app-store password.',
      ],
      emailAction: {
        label: 'Email a deletion request',
        subject: 'Vital account deletion request',
        body: 'Please permanently delete my Vital Collective account.\n\nEmail used for my Vital account:\n\nAnything else that may help identify my account (optional):',
      },
    },
    {
      heading: 'What deletion covers',
      paragraphs: [
        'Deleting your account removes your Vital sign-in and profile, including your member name, avatar and introduction. It also removes your private family information, preferences, Saved data, and private feedback or activity submissions.',
        'Your Community posts and replies are deleted too. Where removing a parent item would break the structure of replies left by other members, Vital may retain a neutral deleted-item marker without your profile attribution so those replies still make sense.',
      ],
    },
    {
      heading: 'Limited retention',
      paragraphs: [
        'Some limited records may be retained only where genuinely necessary and lawful for legal, accounting, security, fraud-prevention, moderation or dispute-handling obligations. Residual encrypted backup copies may remain until they are removed through Vital’s normal backup cycle.',
      ],
      links: [{ label: 'Read the Vital Collective Privacy Notice', href: '/privacy/' }],
    },
    {
      heading: 'App Store and Google Play subscriptions',
      notice:
        'Deleting your Vital account does not cancel an Apple App Store or Google Play subscription. If you have a subscription, cancel it separately through the store that manages it to prevent future renewal charges.',
      links: [
        {
          label: 'Manage or cancel an Apple subscription',
          href: 'https://support.apple.com/en-gb/118428',
        },
        {
          label: 'Manage or cancel a Google Play subscription',
          href: 'https://support.google.com/googleplay/answer/7018481',
        },
      ],
    },
    {
      heading: 'Need help?',
      paragraphs: [
        'Contact Vital at info@vitalcollective.co.uk. You do not need to sign in to use this contact route.',
      ],
    },
  ],
};

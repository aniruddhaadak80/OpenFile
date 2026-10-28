// The person behind OpenFile. Public facts and public profile links only.
export const AUTHOR = {
  name: 'Aniruddha Adak',
  photo: `${import.meta.env.BASE_URL}author/aniruddha-adak.webp`,
  tagline: 'Open-source developer from West Bengal, India',
  location: 'Kolkata area, West Bengal, India',
  education: 'B.Tech in Computer Science and Engineering (2026)',
  facts: [
    'Open-source developer from West Bengal, India (Kolkata area).',
    'B.Tech in Computer Science and Engineering, class of 2026.',
    'Builds agentic harnesses and production-grade agent skills.',
    'Active open-source contributor and frequent hackathon builder: MLH Global Hack Week, Hacktoberfest and DEV challenges.',
    'Writes daily AI news on DEV.',
  ],
  links: [
    { id: 'github', label: 'GitHub', handle: 'aniruddhaadak80', url: 'https://github.com/aniruddhaadak80' },
    { id: 'dev', label: 'DEV', handle: 'aniruddhaadak', url: 'https://dev.to/aniruddhaadak' },
    { id: 'linkedin', label: 'LinkedIn', handle: 'aniruddha-adak', url: 'https://www.linkedin.com/in/aniruddha-adak' },
    { id: 'x', label: 'X', handle: 'asi369_', url: 'https://x.com/asi369_' },
    { id: 'youtube', label: 'YouTube', handle: 'Channel', url: 'https://www.youtube.com/channel/UCPG2FWjVxnz9pKSzK2Bzxlw' },
    { id: 'devpost', label: 'Devpost', handle: 'aniruddhaadak', url: 'https://devpost.com/aniruddhaadak' },
  ] as const,
}
export type AuthorLinkId = (typeof AUTHOR.links)[number]['id']

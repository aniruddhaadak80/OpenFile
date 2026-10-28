/** Heading/anchor slug used by the docs renderer, docs search and "Read the full guide" links. */
export function slugify(s: string) {
  return s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~[\]()]/g, '').replace(/&[a-z]+;/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'section'
}

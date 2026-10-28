// Small building blocks shared by the blog post bodies in src/blog/posts/*.tsx.
// Writing rule for every post: plain words, no em dashes, no exclamation marks.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
export const H2 = ({ children }: { children: string }) => <h2 id={slugify(children)}>{children}</h2>
export const H3 = ({ children }: { children: string }) => <h3 id={slugify(children)}>{children}</h3>
export const Note = ({ title = 'Note', children }: { title?: string; children: ReactNode }) => <div className="callout callout-note"><div className="callout-title">{title}</div><p>{children}</p></div>
export const Tip = ({ children }: { children: ReactNode }) => <div className="callout callout-tip"><div className="callout-title">Tip</div><p>{children}</p></div>
export const Warn = ({ title = 'Careful', children }: { title?: string; children: ReactNode }) => <div className="callout callout-warning"><div className="callout-title">{title}</div><p>{children}</p></div>
/** Link to a tool or page by its slug, for example <T to="merge-pdf">Merge PDF</T> */
export const T = ({ to, children }: { to: string; children: ReactNode }) => <Link to={`/${to}`}>{children}</Link>
/** A simple table that scrolls sideways on small screens */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

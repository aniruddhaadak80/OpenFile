import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import Home from '@/pages/Home'

const ToolPage = lazy(() => import('@/pages/ToolPage'))
const Tools = lazy(() => import('@/pages/Tools'))
const About = lazy(() => import('@/pages/About'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Status = lazy(() => import('@/pages/Status'))
const Workspace = lazy(() => import('@/pages/Workspace'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const Docs = lazy(() => import('@/pages/Docs'))
const History = lazy(() => import('@/pages/History'))
const Settings = lazy(() => import('@/pages/Settings'))
const Blog = lazy(() => import('@/pages/Blog'))
const BlogPost = lazy(() => import('@/pages/BlogPost'))

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Suspense fallback={<div className="grid h-[60vh] place-items-center"><Spinner label="Loading" /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="tools" element={<Tools />} />
            <Route path="category/:id" element={<Tools />} />
            <Route path="workspace" element={<Workspace />} />
            <Route path="about" element={<About />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="status" element={<Status />} />
            <Route path="docs" element={<Docs />} />
            <Route path="docs/*" element={<Docs />} />
            <Route path="changelog" element={<Docs />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="blog" element={<Blog />} />
            <Route path="blog/:slug" element={<BlogPost />} />
            <Route path=":slug" element={<ToolPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

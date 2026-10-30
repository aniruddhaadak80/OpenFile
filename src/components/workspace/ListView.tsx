/* Simple list mode: the pipeline as cards in order. Drag the handle, or focus a card and press Alt + arrow keys. */
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, ArrowUp, ArrowDown, Copy, Trash2, Settings2, GitBranch, AlignLeft } from 'lucide-react'
import { Button, Switch, cn } from '@/components/ui'
import { chain, isLinear, type Graph, type GNode } from '@/pages/workspace/recipe'
import { metaOf } from '@/pages/workspace/catalog'
import { ProgressRing, StepIcon, catColor, useMotion } from './kit'
import type { NodeRun } from './NodeCanvas'

type Props = {
  graph: Graph
  run: NodeRun
  selected: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onReorder: (ordered: GNode[]) => void
  onToggle: (id: string, v: boolean) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onFlatten: () => void
}

function Row({ n, i, total, p }: { n: GNode; i: number; total: number; p: Props & { ordered: GNode[] } }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: n.id })
  const m = metaOf(n.step)!
  const r = p.run[n.id], col = catColor(n.step)
  const move = (d: number) => { const j = i + d; if (j < 0 || j >= total) return; p.onReorder(arrayMove(p.ordered, i, j)) }
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('ws-list-row rounded-2xl border bg-surface p-3 transition-shadow', p.selected === n.id ? 'border-accent ring-4 ring-accent/15' : 'border-border', isDragging && 'z-10 shadow-2xl', !n.enabled && 'opacity-50', r?.state === 'run' && 'ws-node-run')}
      tabIndex={0} onFocus={() => p.onSelect(n.id)} onClick={() => p.onSelect(n.id)}
      onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(-1) } if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(1) } }}
      aria-label={`Step ${i + 1}: ${m.name}. Alt and arrow keys move it.`}>
      <div className="flex items-center gap-2.5">
        <button {...attributes} {...listeners} aria-label={`Drag ${m.name}`} className="touch-none rounded p-1 text-muted hover:text-fg cursor-grab"><GripVertical className="size-4" /></button>
        {r && (r.state === 'run' || r.state === 'done') ? <ProgressRing value={r.state === 'done' ? 1 : r.frac} size={32} stroke={3} color={col} spin label={<StepIcon step={n.step} className="size-3.5" />} />
          : <span className="grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold" style={{ background: col + '22', color: col }}><StepIcon step={n.step} className="size-4" /></span>}
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold"><span className="mr-1.5 font-mono text-xs text-muted">{i + 1}</span>{m.name}</div><div className="truncate text-xs text-muted">{m.desc}</div></div>
        <Switch checked={n.enabled} onChange={(v) => p.onToggle(n.id, v)} />
        <div className="hidden items-center sm:flex">
          <button onClick={(e) => { e.stopPropagation(); move(-1) }} aria-label="Move up" className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); move(1) }} aria-label="Move down" className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowDown className="size-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); p.onDuplicate(n.id) }} aria-label="Duplicate" className="rounded p-1 text-muted hover:text-fg cursor-pointer"><Copy className="size-4" /></button>
        </div>
        <button onClick={(e) => { e.stopPropagation(); p.onOpen(n.id) }} aria-label="Settings" className="rounded p-1 text-muted hover:text-accent cursor-pointer"><Settings2 className="size-4" /></button>
        <button onClick={(e) => { e.stopPropagation(); p.onDelete(n.id) }} aria-label="Remove" className="rounded p-1 text-muted hover:text-danger cursor-pointer"><Trash2 className="size-4" /></button>
      </div>
    </div>
  )
}

export default function ListView(p: Props) {
  const motionLevel = useMotion()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const linear = isLinear(p.graph)
  const ordered = linear ? chain(p.graph) : []
  if (!linear) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm" data-tour="canvas">
        <div className="flex items-center gap-2 font-semibold"><GitBranch className="size-4 text-accent" /> This pipeline branches</div>
        <p className="mt-1 text-muted">List mode shows one straight line. Edit branches on the canvas, or turn the main path into a straight line.</p>
        <ul className="mt-3 space-y-1.5">
          {p.graph.nodes.filter((n) => metaOf(n.step)).map((n) => <li key={n.id} className="flex items-center gap-2 text-xs"><StepIcon step={n.step} className="size-3.5 text-accent" />{metaOf(n.step)!.name}</li>)}
        </ul>
        <Button className="mt-4" variant="outline" size="sm" icon={<AlignLeft className="size-4" />} onClick={p.onFlatten}>Make it a straight line</Button>
      </div>
    )
  }
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const a = ordered.findIndex((n) => n.id === e.active.id), b = ordered.findIndex((n) => n.id === e.over!.id)
    p.onReorder(arrayMove(ordered, a, b))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={ordered.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2" data-tour="canvas">
          <AnimatePresence initial={false}>
            {ordered.map((n, i) => (
              <motion.div key={n.id} layout={motionLevel !== 'off'} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: motionLevel === 'off' ? 0 : 0.25, delay: motionLevel === 'full' ? i * 0.03 : 0 }}>
                <Row n={n} i={i} total={ordered.length} p={{ ...p, ordered }} />
              </motion.div>
            ))}
          </AnimatePresence>
          {!ordered.length && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No steps yet. Add one from the step library.</div>}
        </div>
      </SortableContext>
    </DndContext>
  )
}

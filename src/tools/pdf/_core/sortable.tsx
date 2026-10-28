/* dnd-kit sortable list/grid wrapper (pointer, touch and keyboard). */
import React from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/components/ui'

export { arrayMove }

export function SortableArea<T>({ items, getId, onReorder, children, layout = 'grid', className, renderOverlay }: {
  items: T[]; getId: (t: T) => string; onReorder: (next: T[]) => void; children: React.ReactNode; layout?: 'grid' | 'list'; className?: string
  renderOverlay?: (t: T) => React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [active, setActive] = React.useState<string | null>(null)
  const ids = items.map(getId)
  const onEnd = (e: DragEndEvent) => {
    setActive(null)
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    const from = ids.indexOf(String(a.id)), to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(items, from, to))
  }
  const activeItem = active ? items.find((t) => getId(t) === active) : undefined
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setActive(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180 }}>{activeItem && renderOverlay ? <div className="scale-105 opacity-95 shadow-2xl">{renderOverlay(activeItem)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

export function SortableItem({ id, children, className, handle }: { id: string; children: (p: { dragging: boolean; handleProps: Record<string, any> }) => React.ReactNode; className?: string; handle?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }
  const handleProps = { ...attributes, ...listeners }
  return (
    <div ref={setNodeRef} style={style} className={cn('touch-manipulation', isDragging && 'opacity-40', className)} {...(handle ? {} : handleProps)}>
      {children({ dragging: isDragging, handleProps: handle ? handleProps : {} })}
    </div>
  )
}

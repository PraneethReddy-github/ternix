import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, X, Regex, CaseSensitive } from 'lucide-react'
import type { SearchAddon } from '@xterm/addon-search'
import { cn } from '@/utils/cn'

export function TerminalSearch({ search, onClose }: { search: React.MutableRefObject<SearchAddon | null>; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const opts = { regex, caseSensitive, decorations: { matchOverviewRuler: '#d29922', activeMatchColorOverviewRuler: '#58a6ff' } }
  const next = () => query && search.current?.findNext(query, opts)
  const prev = () => query && search.current?.findPrevious(query, opts)

  return (
    <div className="absolute top-2 right-3 z-20 flex items-center gap-1 bg-surface-2 border border-border rounded-input px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (e.target.value) search.current?.findNext(e.target.value, opts)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.shiftKey ? prev() : next())
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Find"
        className="bg-transparent text-[12px] text-text w-40 outline-none"
      />
      <button className={cn('p-1 rounded', caseSensitive ? 'text-accent' : 'text-muted')} title="Match case" onClick={() => setCaseSensitive((v) => !v)}>
        <CaseSensitive size={13} />
      </button>
      <button className={cn('p-1 rounded', regex ? 'text-accent' : 'text-muted')} title="Regex" onClick={() => setRegex((v) => !v)}>
        <Regex size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text" onClick={prev} title="Previous (Shift+Enter)">
        <ArrowUp size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text" onClick={next} title="Next (Enter)">
        <ArrowDown size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text" onClick={onClose}>
        <X size={13} />
      </button>
    </div>
  )
}

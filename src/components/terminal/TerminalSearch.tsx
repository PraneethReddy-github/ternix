import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, X, Regex, CaseSensitive } from 'lucide-react'
import type { SearchAddon } from '@xterm/addon-search'
import { useThemeStore } from '@/store/useThemeStore'
import { blendHex } from '@/utils/blendHex'
import { cn } from '@/utils/cn'

export function TerminalSearch({ search, onClose }: { search: React.MutableRefObject<SearchAddon | null>; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState({ index: -1, count: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  // Selected as strings rather than as the whole theme: `active()` builds a fresh object on
  // every call, so selecting it would re-render this on every store touch.
  const matchColor = useThemeStore((s) => s.active().yellow)
  const activeColor = useThemeStore((s) => s.active().blue)
  const paneBg = useThemeStore((s) => s.active().background)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // How many matches there are and which one you are on. Only fires while decorations are
  // enabled, which is the other half of why they are configured properly below.
  useEffect(() => {
    const addon = search.current
    if (!addon) return
    const d = addon.onDidChangeResults((r) => setResults({ index: r.resultIndex, count: r.resultCount }))
    return () => {
      d.dispose()
      // Highlights outlive this box otherwise — closing find must leave the pane clean.
      addon.clearDecorations()
    }
  }, [search])

  const opts = {
    regex,
    caseSensitive,
    decorations: {
      matchBackground: blendHex(matchColor, paneBg, 0.32),
      matchBorder: blendHex(matchColor, paneBg, 0.65),
      matchOverviewRuler: matchColor,
      activeMatchBackground: blendHex(activeColor, paneBg, 0.55),
      activeMatchBorder: activeColor,
      activeMatchColorOverviewRuler: activeColor
    }
  }

  const next = () => query && search.current?.findNext(query, opts)
  const prev = () => query && search.current?.findPrevious(query, opts)

  // -1 is the addon's way of saying it stopped counting past its highlight limit.
  const tally = !query ? null : !results.count ? 'No results' : results.index < 0 ? `${results.count}+` : `${results.index + 1}/${results.count}`
  const none = !!query && !results.count

  return (
    <div
      className="absolute top-2 right-3 z-20 flex items-center gap-1 bg-surface-2 border border-border rounded-input px-2 py-1 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (e.target.value) search.current?.findNext(e.target.value, opts)
          else {
            search.current?.clearDecorations()
            setResults({ index: -1, count: 0 })
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.shiftKey ? prev() : next())
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Find"
        className={cn('bg-transparent text-[12px] w-40 outline-none', none ? 'text-red-400' : 'text-text')}
      />
      {tally && <span className={cn('text-[11px] tabular-nums shrink-0', none ? 'text-red-400' : 'text-muted')}>{tally}</span>}
      <button className={cn('p-1 rounded', caseSensitive ? 'text-accent' : 'text-muted')} title="Match case" onClick={() => setCaseSensitive((v) => !v)}>
        <CaseSensitive size={13} />
      </button>
      <button className={cn('p-1 rounded', regex ? 'text-accent' : 'text-muted')} title="Regex" onClick={() => setRegex((v) => !v)}>
        <Regex size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text disabled:opacity-40" disabled={!results.count} onClick={prev} title="Previous (Shift+Enter)">
        <ArrowUp size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text disabled:opacity-40" disabled={!results.count} onClick={next} title="Next (Enter)">
        <ArrowDown size={13} />
      </button>
      <button className="p-1 text-muted hover:text-text" onClick={onClose} title="Close (Esc)">
        <X size={13} />
      </button>
    </div>
  )
}

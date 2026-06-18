import { useState } from 'react'
import { Radio, Send, X } from 'lucide-react'
import { useTabStore } from '@/store/useTabStore'

/** Floating input shown while any tab has broadcast enabled. Sends keystrokes to every
 *  pane of every broadcast-enabled tab at once. */
export function BroadcastBar() {
  const tabs = useTabStore((s) => s.tabs)
  const broadcastTabs = tabs.filter((t) => t.broadcast)
  const toggleBroadcast = useTabStore((s) => s.toggleBroadcast)
  const [value, setValue] = useState('')

  if (broadcastTabs.length === 0) return null
  const paneIds = broadcastTabs.flatMap((t) => t.panes.map((p) => p.id))

  const send = (data: string) => window.ternix.broadcast.write(paneIds, data)

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[640px] max-w-[90vw]">
      <div className="flex items-center gap-2 bg-surface border-2 border-warning rounded-panel px-3 py-2 shadow-2xl">
        <Radio size={16} className="text-warning tx-pulse" />
        <span className="text-[11px] text-warning whitespace-nowrap">
          Broadcasting to {paneIds.length} pane{paneIds.length > 1 ? 's' : ''}
        </span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send(value + '\r')
              setValue('')
            }
          }}
          placeholder="Type a command to send to all selected sessions…"
          className="flex-1 bg-bg border border-border rounded-input px-2 py-1 text-[13px] text-text"
        />
        <button className="text-muted hover:text-text" title="Send" onClick={() => { send(value + '\r'); setValue('') }}>
          <Send size={15} />
        </button>
        <button
          className="text-muted hover:text-danger"
          title="Stop broadcasting"
          onClick={() => broadcastTabs.forEach((t) => toggleBroadcast(t.id))}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

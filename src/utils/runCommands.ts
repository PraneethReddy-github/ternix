/**
 * Send a multi-line command block to a terminal ONE line at a time, waiting for
 * the shell prompt to return before sending the next line.
 *
 * Why not just write the whole block at once: long/interactive commands
 * (`apt install`, anything that runs `needrestart`, or a pager) flush pending
 * tty input for safety, so any lines typed ahead get echoed and then discarded
 * — the classic "the rest of my snippet never ran" bug. By gating each line on
 * the prompt reappearing we never type ahead, so nothing gets flushed.
 *
 * Prompt detection is a best-effort heuristic (quiet-period debounce + a prompt
 * regex). A hard per-line timeout guarantees the queue can never wedge forever
 * if the prompt is mis-detected (e.g. a command sitting in a pager).
 */

// Matches the tail of a settled shell prompt: bash/zsh/sh `$`/`#`/`%`, or the
// PS2 continuation `>` (so multi-line for-loops / heredocs in a snippet work).
const PROMPT_RE = /[#$%>]\s?$/

/** Does the recent output tail look like a shell prompt waiting for input? */
export function looksLikePrompt(buf: string): boolean {
  const lastLine = buf.replace(/\s+$/, '').split('\n').pop() ?? ''
  return PROMPT_RE.test(lastLine)
}

const QUIET_MS = 300 // output must settle this long before we trust a prompt
const HARD_TIMEOUT_MS = 10 * 60_000 // fallback so a mis-detected prompt can't wedge the queue

export function runCommandsSequentially(paneId: string, block: string): void {
  const lines = block.replace(/\r\n/g, '\n').split('\n')

  // Single line: nothing to sequence — send it and be done.
  if (lines.length <= 1) {
    window.ternix.terminal.write(paneId, block + '\r')
    return
  }

  let i = 0
  const sendNext = () => {
    if (i >= lines.length) return
    window.ternix.terminal.write(paneId, lines[i++] + '\r')
    waitForPrompt(sendNext)
  }

  const waitForPrompt = (done: () => void) => {
    let buf = ''
    let quiet: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      off()
      clearTimeout(quiet)
      clearTimeout(hard)
      done()
    }
    const off = window.ternix.terminal.onData(paneId, (d) => {
      buf += d
      if (buf.length > 4096) buf = buf.slice(-4096) // only the tail matters
      clearTimeout(quiet)
      quiet = setTimeout(() => looksLikePrompt(buf) && finish(), QUIET_MS)
    })
    const hard = setTimeout(finish, HARD_TIMEOUT_MS)
  }

  sendNext()
}

import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so themes can swap them at runtime.
        bg: 'var(--tx-bg)',
        surface: 'var(--tx-surface)',
        'surface-2': 'var(--tx-surface-2)',
        border: 'var(--tx-border)',
        accent: 'var(--tx-accent)',
        'accent-muted': 'var(--tx-accent-muted)',
        text: 'var(--tx-text)',
        muted: 'var(--tx-muted)',
        success: 'var(--tx-success)',
        warning: 'var(--tx-warning)',
        danger: 'var(--tx-danger)'
      },
      fontFamily: {
        mono: 'var(--tx-font-mono)',
        ui: 'var(--tx-font-ui)'
      },
      borderRadius: {
        input: '6px',
        panel: '8px'
      },
      transitionDuration: {
        DEFAULT: '150ms'
      }
    }
  },
  plugins: []
} satisfies Config

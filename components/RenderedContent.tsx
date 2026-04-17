'use client'

import { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/** Mermaid from ```mermaid ... ``` fence, or whole body when content_type is diagram */
export function extractMermaidCode(text: string | undefined, contentType: string | undefined): string {
  const t = text || ''
  const fence = t.match(/```mermaid\n?([\s\S]*?)```/)
  if (fence?.[1]?.trim()) return fence[1].trim()
  if (contentType === 'diagram' && t.trim()) return t.trim()
  return ''
}

let mermaidInitPromise: Promise<void> | null = null

function ensureMermaidInitialized(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { mermaid?: { initialize: (c: unknown) => void; render: (id: string, code: string) => Promise<{ svg: string }> } }
  if (w.mermaid?.initialize) return Promise.resolve()
  if (mermaidInitPromise) return mermaidInitPromise
  mermaidInitPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
    script.async = true
    script.onload = () => {
      try {
        const m = (window as unknown as { mermaid: { initialize: (c: unknown) => void } }).mermaid
        m.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#071739',
            primaryTextColor: '#E3C39D',
            primaryBorderColor: '#E3C39D',
            lineColor: '#4B6382',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            mainBkg: '#071739',
            nodeTextColor: '#E3C39D',
          },
        })
        resolve()
      } catch (e) {
        reject(e)
      }
    }
    script.onerror = () => reject(new Error('mermaid load failed'))
    document.head.appendChild(script)
  })
  return mermaidInitPromise
}

export function MermaidPreview({ code }: { code: string }) {
  const [svg, setSvg] = useState('')
  const id = useRef(`mermaid-${Math.random().toString(36).slice(2, 11)}`)

  useEffect(() => {
    if (!code.trim()) {
      setSvg('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        await ensureMermaidInitialized()
        if (cancelled) return
        const mermaid = (window as unknown as { mermaid: { render: (id: string, code: string) => Promise<{ svg: string }> } }).mermaid
        const renderId = `${id.current}_${Math.random().toString(36).slice(2, 9)}`
        const { svg: rendered } = await mermaid.render(renderId, code)
        if (!cancelled) setSvg(rendered)
      } catch {
        if (!cancelled) {
          setSvg(
            '<p style="color:#999;font-size:12px;padding:8px">Diagram preview failed</p>'
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (!code.trim()) return null

  return (
    // eslint-disable-next-line react/no-danger
    <div dangerouslySetInnerHTML={{ __html: svg }} />
  )
}

const markdownBodyComponents: Components = {
  table: ({ children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0' }}>
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th style={{
      background: '#071739', color: '#E3C39D', padding: '6px 10px',
      textAlign: 'left', fontSize: 11, fontWeight: 600,
      border: '1px solid #4B6382',
    }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '5px 10px', border: '1px solid #e5e7eb',
      fontSize: 11, color: '#1f2937',
    }}>
      {children}
    </td>
  ),
  p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
}

export function RenderedContent({ text, contentType }: { text: string; contentType?: string }) {
  const t = text || ''

  // If whole body is a diagram
  const mc = extractMermaidCode(t, contentType)
  if (contentType === 'diagram' && mc.length > 0 && mc === t.trim()) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.7, color: '#1f2937' }}>
        <div style={{
          margin: '8px 0', padding: 16, background: '#071739',
          borderRadius: 10, overflow: 'auto',
        }}
        >
          <MermaidPreview code={mc} />
        </div>
      </div>
    )
  }

  // Split content into alternating text and mermaid blocks
  const parts = t.split(/(```mermaid[\s\S]*?```)/g)

  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: '#1f2937' }}>
      {parts.map((part, i) => {
        if (part.startsWith('```mermaid')) {
          const code = part.replace(/```mermaid\n?/, '').replace(/\n?```$/, '')
          return (
            <div key={i} style={{
              margin: '10px 0', padding: 16, background: '#071739',
              borderRadius: 10, overflow: 'auto',
            }}
            >
              <MermaidPreview code={code} />
            </div>
          )
        }
        if (!part.trim()) return null
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownBodyComponents}>
            {part}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}

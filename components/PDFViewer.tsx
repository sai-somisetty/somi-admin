"use client";
import { useState } from 'react';
import { Document, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_URL = "https://rwuntjxogfrqxaphjolj.supabase.co/storage/v1/object/public/textbooks/Paper1_20-06-2024_R_CMA_F.pdf";
const PDF_OFFSET = 8;
const BASE_WIDTH = 420;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

interface Props {
  bookPage: number;
}

export default function PDFViewer({ bookPage }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const pdfPage = bookPage + PDF_OFFSET;

  function zoomIn() {
    setScale(s => Math.min(ZOOM_MAX, parseFloat((s + ZOOM_STEP).toFixed(1))))
  }

  function zoomOut() {
    setScale(s => Math.max(ZOOM_MIN, parseFloat((s - ZOOM_STEP).toFixed(1))))
  }

  function resetZoom() {
    setScale(1.0)
  }

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
    minWidth: 26,
    padding: '0 8px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: 'white',
    color: '#374151',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    lineHeight: 1,
    transition: 'background 0.15s',
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 16px 16px',
    }}>
      {/* Zoom toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 8,
        padding: '4px 8px',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}>
        <button
          onClick={zoomOut}
          disabled={scale <= ZOOM_MIN}
          style={{ ...btnStyle, opacity: scale <= ZOOM_MIN ? 0.4 : 1 }}
          title="Zoom out"
        >
          −
        </button>
        <span style={{ fontSize: 12, color: '#6b7280', minWidth: 44, textAlign: 'center', fontWeight: 500 }}>
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={scale >= ZOOM_MAX}
          style={{ ...btnStyle, opacity: scale >= ZOOM_MAX ? 0.4 : 1 }}
          title="Zoom in"
        >
          +
        </button>
        <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
        <button
          onClick={resetZoom}
          style={btnStyle}
          title="Reset zoom"
        >
          Fit
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#666', marginBottom: 8, textAlign: 'center', flexShrink: 0 }}>
        Book Page {bookPage} · Select text to copy
      </div>

      <Document
        file={PDF_URL}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <div style={{ padding: 40, color: '#666' }}>
            Loading PDF...
          </div>
        }
      >
        <PdfPage
          pageNumber={pdfPage}
          width={Math.round(BASE_WIDTH * scale)}
          renderTextLayer={true}
          renderAnnotationLayer={false}
        />
      </Document>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          fontSize: 11,
          color: '#888',
          background: '#fff',
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid #e0e0e0',
        }}>
          PDF page {pdfPage}
        </div>
      </div>
      {/* suppress unused warning */}
      <span style={{ display: 'none' }}>{numPages}</span>
    </div>
  );
}

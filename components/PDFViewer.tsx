"use client";
import { useState } from 'react';
import { Document, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_URL = "https://rwuntjxogfrqxaphjolj.supabase.co/storage/v1/object/public/textbooks/Paper1_20-06-2024_R_CMA_F.pdf";
const PDF_OFFSET = 8;

interface Props {
  bookPage: number;
}

export default function PDFViewer({ bookPage }: Props) {
  const [numPages, setNumPages] = useState(0);
  const pdfPage = bookPage + PDF_OFFSET;

  return (
    <div style={{ 
      height: '100%', 
      overflow: 'auto',
      background: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px'
    }}>
      <div style={{
        fontSize: 11,
        color: '#666',
        marginBottom: 8,
        textAlign: 'center'
      }}>
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
          width={420}
          renderTextLayer={true}
          renderAnnotationLayer={false}
        />
      </Document>
      <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 12,
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: 11,
          color: '#888',
          background: '#fff',
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid #e0e0e0'
        }}>
          PDF page {pdfPage}
        </div>
      </div>
      {/* suppress unused warning */}
      <span style={{ display: 'none' }}>{numPages}</span>
    </div>
  );
}

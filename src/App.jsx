import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './App.css'

// Required setup for react-pdf to render PDFs correctly
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function App() {
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState([])
  const [activeDoc, setActiveDoc] = useState(null)
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const pageRefs = useRef([])
  const saveTimeout = useRef(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  async function fetchDocuments() {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching documents:', error)
    } else {
      setDocuments(data)
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0]
    if (!file) return

    setUploading(true)
    const fileName = `${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName)

    const { error: insertError } = await supabase
      .from('documents')
      .insert({ title: file.name, file_url: urlData.publicUrl })

    if (insertError) {
      alert('Saving file info failed: ' + insertError.message)
    } else {
      fetchDocuments()
    }

    setUploading(false)
  }

  function openDocument(doc) {
    setActiveDoc(doc)
    setNumPages(null)
    setCurrentPage(doc.last_page || 1)
    pageRefs.current = []
  }

  function closeDocument() {
    setActiveDoc(null)
    setNumPages(null)
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages)

    // After pages render, scroll to the saved last_page
    setTimeout(() => {
      const savedPage = activeDoc.last_page || 1
      const target = pageRefs.current[savedPage - 1]
      if (target) {
        target.scrollIntoView()
      }
    }, 300)
  }

  // Called whenever scrolling happens inside the reader
  function handleScroll(e) {
    const container = e.target
    const scrollMiddle = container.scrollTop + container.clientHeight / 2

    // Find which page's position matches the middle of the visible area
    let visiblePage = 1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i]
      if (el && el.offsetTop <= scrollMiddle) {
        visiblePage = i + 1
      }
    }

    if (visiblePage !== currentPage) {
      setCurrentPage(visiblePage)
      scheduleSave(visiblePage)
    }
  }

  // Debounce saving so we don't hit the database on every tiny scroll
  function scheduleSave(page) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveLastPage(page)
    }, 800)
  }

  async function saveLastPage(page) {
    if (!activeDoc) return
    const { error } = await supabase
      .from('documents')
      .update({ last_page: page })
      .eq('id', activeDoc.id)

    if (error) {
      console.error('Failed to save reading position:', error)
    } else {
      setDocuments((docs) =>
        docs.map((d) => (d.id === activeDoc.id ? { ...d, last_page: page } : d))
      )
    }
  }

  // ---------- READER VIEW ----------
  if (activeDoc) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <button onClick={closeDocument} style={{ marginBottom: '1rem' }}>
          ← Back to list
        </button>
        <h2>{activeDoc.title}</h2>
        <p style={{ color: '#666' }}>
          Page {currentPage} of {numPages || '...'}
        </p>

        <div
          onScroll={handleScroll}
          style={{
            height: '80vh',
            overflowY: 'auto',
            border: '1px solid #ddd',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
          }}
        >
          <Document file={activeDoc.file_url} onLoadSuccess={onDocumentLoadSuccess}>
            {Array.from({ length: numPages || 0 }, (_, index) => (
              <div key={index + 1} ref={(el) => (pageRefs.current[index] = el)}>
                <Page pageNumber={index + 1} />
              </div>
            ))}
          </Document>
        </div>
      </div>
    )
  }

  // ---------- LIST VIEW ----------
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>My Reader App</h1>

      <div style={{ marginBottom: '2rem' }}>
        <input type="file" accept="application/pdf" onChange={handleFileUpload} />
        {uploading && <p>Uploading...</p>}
      </div>

      <h2>Your Documents</h2>
      {documents.length === 0 && <p>No documents uploaded yet.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {documents.map((doc) => (
          <li
            key={doc.id}
            onClick={() => openDocument(doc)}
            style={{
              padding: '1rem',
              border: '1px solid #ccc',
              borderRadius: '8px',
              marginBottom: '0.5rem',
              cursor: 'pointer',
            }}
          >
            <div>{doc.title}</div>
            <div style={{ fontSize: '0.85rem', color: '#888' }}>
              Last read: page {doc.last_page || 1}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
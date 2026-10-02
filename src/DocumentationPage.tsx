import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import graphDocumentation from '../docs/graphique.md?raw'
import supabaseDocumentation from '../docs/supabase-test.md?raw'
import userGuideDocument from '../docs/guide-utilisateur.md?raw'
import technicalDocument from '../docs/documentation-technique.md?raw'
import visualizationDocumentation from '../docs/visualisations.md?raw'

export type DocumentationDocument = 'guide' | 'technical' | 'visualisations' | 'graphique' | 'supabase'

const documentationOptions: { id: DocumentationDocument; label: string }[] = [
  { id: 'guide', label: 'Guide utilisateur' },
  { id: 'technical', label: 'Documentation technique' },
  { id: 'visualisations', label: 'Visualisations' },
  { id: 'graphique', label: 'Graphique' },
  { id: 'supabase', label: 'Configuration Supabase' },
]

const documentationContent: Record<DocumentationDocument, string> = {
  guide: userGuideDocument,
  technical: technicalDocument,
  visualisations: visualizationDocumentation,
  graphique: graphDocumentation,
  supabase: supabaseDocumentation,
}

const documentationLinks: Record<string, DocumentationDocument> = {
  'guide-utilisateur.md': 'guide',
  'documentation-technique.md': 'technical',
  'visualisations.md': 'visualisations',
  'graphique.md': 'graphique',
  'supabase-test.md': 'supabase',
}

export default function DocumentationPage({ document, setDocument }: { document: DocumentationDocument; setDocument: (value: DocumentationDocument) => void }) {
  const selectedDocument = documentationOptions.find((option) => option.id === document) ?? documentationOptions[0]

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">RESSOURCES · BANC DE CHAUFFAGE</div>
        <h1>{selectedDocument.label}</h1>
        <p>Guides d’utilisation, architecture, visualisations et configuration du projet.</p>
      </div>
    </div>
    <nav className="documentation-switcher" aria-label="Documents du projet" role="tablist">
      {documentationOptions.map((option, index) => <button key={option.id} type="button" role="tab" className={`documentation-tab ${document === option.id ? 'active' : ''}`} aria-selected={document === option.id} onClick={() => setDocument(option.id)}><span>{String(index + 1).padStart(2, '0')}</span>{option.label}</button>)}
    </nav>
    <article className="documentation-document">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ href, children }) => {
          const fileName = href?.split(/[?#]/, 1)[0].split('/').pop()
          const linkedDocument = fileName ? documentationLinks[fileName] : undefined
          return linkedDocument
            ? <a href="#documentation" onClick={(event) => { event.preventDefault(); setDocument(linkedDocument) }}>{children}</a>
            : <a href={href}>{children}</a>
        },
      }}>{documentationContent[document]}</ReactMarkdown>
    </article>
  </>
}
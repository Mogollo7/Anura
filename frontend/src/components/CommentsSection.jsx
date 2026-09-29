import { useEffect, useRef, useState } from 'react'
import { MdCheck, MdClose, MdSend, MdFactCheck, MdChatBubbleOutline, MdExpandMore } from 'react-icons/md'
import { useCommentsStore } from '../store/commentsStore'
import { mentionQuery, filterTaxa, insertTaxonMention, useTaxonCatalog, RANK_LABEL } from '../species/commentTaxonCatalog'
import Avatar from './Avatar'
import GuestLoginModal from './GuestLoginModal'
import './CommentsSection.css'

const timeAgo = (iso) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

function StanceIcon({ stance }) {
  if (stance === 'agree') return <MdCheck aria-label="De acuerdo" className="comment-stance comment-stance--agree" />
  if (stance === 'disagree') return <MdClose aria-label="En desacuerdo" className="comment-stance comment-stance--disagree" />
  return null
}

function ProposalCard({ proposal }) {
  return (
    <div className="comment-proposal">
      <span className="comment-proposal-badge">Refuta</span>
      <div>
        <p className="comment-proposal-label">Identificación propuesta</p>
        <strong><i>{proposal.scientificName}</i></strong>
        {proposal.commonName && <span className="comment-proposal-common"> · {proposal.commonName}</span>}
      </div>
    </div>
  )
}

function CommentRow({ comment, onReply, isReply = false }) {
  return (
    <div className={`comment-row ${isReply ? 'comment-row--reply' : ''}`}>
      <Avatar alt={comment.username} placeholderClassName="comment-avatar" />
      <div className="comment-row-body">
        <div className="comment-row-head">
          <strong>@{comment.username}</strong>
          <StanceIcon stance={comment.stance} />
          <span className="comment-time">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="comment-text">{comment.body}</p>
        {comment.taxonProposal && <ProposalCard proposal={comment.taxonProposal} />}
        <button type="button" className="comment-reply-btn" onClick={() => onReply(comment)}>Responder</button>
      </div>
    </div>
  )
}

/**
 * Comentarios de una observación: hilos con respuestas, postura (de acuerdo/
 * en desacuerdo, solo en los comentarios semilla), y @mención de taxón que
 * marca "refuta" y pasa la observación a revisión experta — misma lógica que
 * ObservationCommentsSheet.kt, en línea en la página en vez de una hoja
 * modal (la web no necesita el patrón de bottom sheet del móvil aquí).
 * Un invitado puede leer todo; comentar o responder le pide iniciar sesión.
 */
export default function CommentsSection({ observationId, speciesContext, isLoggedIn, username }) {
  const { ensureSeeded, commentsFor, addComment, hasExpertReview } = useCommentsStore()
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null) // { topId, username }
  const [proposal, setProposal] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [guestPrompt, setGuestPrompt] = useState(false)
  const [sectionOpen, setSectionOpen] = useState(false)
  const inputRef = useRef(null)
  const taxonCatalog = useTaxonCatalog()

  useEffect(() => {
    ensureSeeded(observationId, speciesContext)
  }, [observationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const comments = commentsFor(observationId)
  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0)
  const query = mentionQuery(draft)
  const suggestions = query != null ? filterTaxa(taxonCatalog, query) : []

  const startReply = (comment, topId) => {
    if (!isLoggedIn) { setGuestPrompt(true); return }
    setReplyTo({ topId: topId || comment.id, username: comment.username })
    setDraft(`@${comment.username} `)
    inputRef.current?.focus()
  }

  const cancelReply = () => { setReplyTo(null); setDraft(''); setProposal(null) }

  const pickTaxon = (taxon) => {
    setDraft((d) => insertTaxonMention(d, taxon))
    setProposal({ scientificName: taxon.scientificName, commonName: taxon.commonName })
  }

  const submit = (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    addComment(observationId, { body, username, parentId: replyTo?.topId || null, taxonProposal: proposal })
    setDraft(''); setReplyTo(null); setProposal(null)
  }

  const toggleReplies = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="detail-card card comments-section">
      <button
        type="button"
        className="comments-section-toggle"
        onClick={() => setSectionOpen((v) => !v)}
        aria-expanded={sectionOpen}
      >
        <h3><MdChatBubbleOutline aria-hidden /> Comentarios{total > 0 ? ` (${total})` : ''}</h3>
        <MdExpandMore aria-hidden className={`comments-section-chevron ${sectionOpen ? 'is-open' : ''}`} />
      </button>

      {sectionOpen && (
        <>
          {hasExpertReview(observationId) && (
            <p className="comments-expert-banner"><MdFactCheck aria-hidden /> En revisión experta tras una refutación</p>
          )}

          {comments.length === 0 ? (
            <p className="comments-empty">Todavía no hay comentarios. Aportá a la identificación.</p>
          ) : (
            <div className="comments-list">
              {comments.map((c) => (
                <div key={c.id} className="comment-thread">
                  <CommentRow comment={c} onReply={(cc) => startReply(cc, c.id)} />
                  {c.replies.length > 0 && (
                    <button type="button" className="comment-toggle-replies" onClick={() => toggleReplies(c.id)}>
                      {expanded.has(c.id) ? 'Ocultar respuestas' : `Ver ${c.replies.length} respuesta${c.replies.length > 1 ? 's' : ''}`}
                    </button>
                  )}
                  {expanded.has(c.id) && c.replies.map((r) => (
                    <CommentRow key={r.id} comment={r} onReply={(cc) => startReply(cc, c.id)} isReply />
                  ))}
                </div>
              ))}
            </div>
          )}

          {isLoggedIn ? (
            <form className="comment-composer" onSubmit={submit}>
              {replyTo && (
                <div className="comment-composer-context">
                  <span>Respondiendo a @{replyTo.username}</span>
                  <button type="button" onClick={cancelReply} aria-label="Cancelar respuesta"><MdClose aria-hidden /></button>
                </div>
              )}
              {proposal && (
                <div className="comment-composer-context comment-composer-context--proposal">
                  <span>Proponiendo: <i>{proposal.scientificName}</i></span>
                  <button type="button" onClick={() => setProposal(null)} aria-label="Quitar propuesta"><MdClose aria-hidden /></button>
                </div>
              )}
              <div className="comment-composer-row">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={replyTo ? `Respondé a ${replyTo.username}…` : 'Aportá a la identificación… (mencioná un taxón con @)'}
                />
                <button type="submit" className="comment-send-btn" disabled={!draft.trim()} aria-label="Publicar comentario">
                  <MdSend aria-hidden />
                </button>
              </div>
              {suggestions.length > 0 && (
                <ul className="comment-mention-list">
                  {suggestions.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => pickTaxon(t)}>
                        <span className="comment-mention-name"><i>{t.scientificName}</i></span>
                        <span className="comment-mention-rank">{RANK_LABEL[t.rank]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          ) : (
            <button type="button" className="comment-guest-cta" onClick={() => setGuestPrompt(true)}>
              Inicia sesión para comentar
            </button>
          )}
        </>
      )}

      {guestPrompt && (
        <GuestLoginModal
          onClose={() => setGuestPrompt(false)}
          Icon={MdChatBubbleOutline}
          title="Comentá esta observación"
          description="Inicia sesión para comentar, responder o proponer otra identificación."
        />
      )}
    </div>
  )
}

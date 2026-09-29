import { MdFavorite, MdFavoriteBorder } from 'react-icons/md'

/**
 * Botón de corazón para marcar/quitar favorito. Puramente presentacional:
 * cada página conserva su propia lógica de like (semántica distinta entre
 * el feed general y la lista de favoritos de otro usuario), pero antes el
 * JSX del botón en sí estaba copiado en Explorer.jsx, PeopleObservations.jsx
 * y PeopleFavorites.jsx.
 */
export default function FavoriteHeartButton({ liked, disabled, onClick, title, ariaLabel }) {
  return (
    <button
      type="button"
      className={`po-heart-btn ${liked ? 'liked' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title}
    >
      {liked ? <MdFavorite aria-hidden /> : <MdFavoriteBorder aria-hidden />}
    </button>
  )
}

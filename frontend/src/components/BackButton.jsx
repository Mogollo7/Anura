import { useNavigate } from 'react-router-dom';
import { MdArrowBack } from 'react-icons/md';
import './BackButton.css';

export default function BackButton({ to, onClick, className = '', noWrapper = false }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  const button = (
    <button className={`btn-back ${!noWrapper ? '' : className}`} onClick={handleBack}>
      <MdArrowBack aria-hidden /> Volver
    </button>
  );

  if (noWrapper) return button;

  return (
    <div className={`back-button-wrapper ${className}`}>
      {button}
    </div>
  );
}

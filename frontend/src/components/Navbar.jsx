import { useNavigate, useLocation } from 'react-router-dom';
import { FaCamera, FaMapLocationDot, FaUser } from 'react-icons/fa6'
import './Navbar.css';

export default function Navbar({ isGuest = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/explorer') {
      return location.pathname === '/explorer' || location.pathname.startsWith('/explorer/')
    }
    return location.pathname === path
  }

  return (
    <nav className="main-navbar">
      <div className="nav-container">
        <div
          onClick={() => navigate('/home/camara')}
          className={isActive('/home/camara') ? 'nav-item active' : 'nav-item'}
          role="presentation"
        >
          <span className="nav-icon"><FaCamera aria-hidden /></span>
          <span className="nav-text">Cámara</span>
        </div>
        <div onClick={() => navigate('/explorer')} className={isActive('/explorer') ? 'nav-item active' : 'nav-item'}>
          <span className="nav-icon"><FaMapLocationDot aria-hidden /></span>
          <span className="nav-text">Explorar</span>
        </div>
        <div
          onClick={() => navigate('/home/profile')}
          className={isActive('/home/profile') ? 'nav-item active' : 'nav-item'}
          role="presentation"
        >
          <span className="nav-icon"><FaUser aria-hidden /></span>
          <span className="nav-text">Perfil</span>
        </div>
      </div>
    </nav>
  );
}

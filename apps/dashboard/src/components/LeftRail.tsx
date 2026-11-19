import { NavLink } from 'react-router'
import { useDashboard } from '../store'

const LINKS = [
  { to: '/', label: 'Giochi', icon: '🎮' },
  { to: '/sources', label: 'Sorgenti', icon: '📡' },
  { to: '/dj', label: 'DJ Pad', icon: '🎚️' },
  { to: '/gifts', label: 'Regali', icon: '🎁' },
  { to: '/setup', label: 'Overlay', icon: '🔗' },
  { to: '/qualita', label: 'Qualità', icon: '🎯' },
]

export function LeftRail() {
  const { connected } = useDashboard()
  return (
    <nav className="left-rail">
      <div className="left-rail__brand" aria-label="Zerocade">
        Z
      </div>
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end className="left-rail__link">
          <span className="left-rail__icon" aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </NavLink>
      ))}
      <span
        className={`status-dot${connected ? ' status-dot--on' : ''}`}
        role="status"
        title={connected ? 'Collegato al server' : 'Server non raggiungibile'}
        aria-label={connected ? 'Collegato al server' : 'Server non raggiungibile'}
      />
    </nav>
  )
}

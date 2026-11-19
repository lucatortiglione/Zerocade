import { NavLink } from 'react-router'
import { useDashboard } from '../store'

const LINKS = [
  { to: '/', label: 'Games', icon: '🎮' },
  { to: '/sources', label: 'Sources', icon: '📡' },
  { to: '/dj', label: 'DJ Pad', icon: '🎚️' },
  { to: '/gifts', label: 'Gifts', icon: '🎁' },
  { to: '/setup', label: 'Setup', icon: '🔗' },
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

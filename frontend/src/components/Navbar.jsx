import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-[1000] bg-cream-100/95 backdrop-blur border-b border-charcoal-700/10">
      <div className="max-w-screen-xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link
          to="/"
          className="font-display text-2xl font-light tracking-widest text-charcoal-800 select-none"
        >
          ReadyMe
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-10">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/contact" className="nav-link">Contact</Link>
          <Link to="/help" className="nav-link">Help</Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-1"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-px bg-charcoal-800 transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-px bg-charcoal-800 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-px bg-charcoal-800 transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-cream-100 border-t border-charcoal-700/10 px-6 py-4 flex flex-col gap-4">

          <Link
            to="/"
            className="nav-link py-1"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </Link>

          <Link
            to="/contact"
            className="nav-link py-1"
            onClick={() => setMenuOpen(false)}
          >
            Contact
          </Link>

          <Link
            to="/help"
            className="nav-link py-1"
            onClick={() => setMenuOpen(false)}
          >
            Help
          </Link>

        </div>
      )}
    </header>
  )
}
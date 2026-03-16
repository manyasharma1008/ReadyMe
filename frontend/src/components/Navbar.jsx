import { Link, useLocation } from "react-router-dom"
import { useState } from "react"

export default function Navbar() {
  const location = useLocation()
  const isPreview = location.pathname === "/preview"
  const [menuOpen, setMenuOpen] = useState(false)

  const linkColor = isPreview ? "text-white" : "text-[#2C2B28]"

  return (
    <nav className="absolute top-0 w-full z-50 backdrop-blur-md px-6 md:px-10 lg:px-14 py-6 flex items-center justify-between">
      {/* Logo */}
      <div className={`logo-readyme ${linkColor}`}>
        ReadyMe
      </div>

      {/* Desktop / Tablet Menu */}
      <div className="hidden md:flex items-center gap-8 lg:gap-12">
        <Link to="/" className={`nav-link ${linkColor}`}>HOME</Link>
        <Link to="/contact" className={`nav-link ${linkColor}`}>CONTACT</Link>
        <Link to="/help" className={`nav-link ${linkColor}`}>HELP</Link>
      </div>

      {/* Mobile Hamburger */}
      <button
        className={`md:hidden flex flex-col gap-[5px] ${linkColor}`}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className="w-6 h-[2px] bg-current"></span>
        <span className="w-6 h-[2px] bg-current"></span>
        <span className="w-6 h-[2px] bg-current"></span>
      </button>

      {menuOpen && (
        <div className="mobile-menu absolute top-full left-0 w-full bg-[#F5F1EB] shadow-md md:hidden flex flex-col items-center py-6 gap-6">
          <Link to="/" className="nav-link" onClick={() => setMenuOpen(false)}>
            HOME
          </Link>

          <Link to="/contact" className="nav-link" onClick={() => setMenuOpen(false)}>
            CONTACT
          </Link>

          <Link to="/help" className="nav-link" onClick={() => setMenuOpen(false)}>
            HELP
          </Link>
        </div>
      )}

    </nav>
  )
}
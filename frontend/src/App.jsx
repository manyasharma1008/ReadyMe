import { Component } from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"

import { AppProvider } from "./context/AppContext"

import Home from "./pages/Home"
import Contact from "./pages/Contact"
import Help from "./pages/Help"

import CameraPermission from "./pages/CameraPermission"
import BodyScan from "./pages/BodyScan"
import SizeResult from "./pages/SizeResult"

import PreviewRoom from "./components/PreviewRoom"

// Error Boundary to prevent blank pages on component crashes
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#e7e3dd] flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-2xl font-light text-charcoal-900 mb-4">
            Something went wrong
          </h1>
          <p className="text-sm text-charcoal-700 mb-4">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          {this.state.error && (
            <p className="text-xs text-red-600 mb-4 max-w-md">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="text-sm bg-clay text-white px-4 py-2 rounded hover:opacity-90"
          >
            Refresh Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// ikdf
function App() {
  return (
    <AppProvider>
      <ErrorBoundary>
        <Router>
          <Routes>

          {/* Landing Page */}
          <Route path="/" element={<Home />} />

          {/* Camera Access Page */}
          <Route path="/camera" element={<CameraPermission />} />

          {/* Body Scan Page */}
          <Route path="/scan" element={<BodyScan />} />

          {/* Size Recommendation */}
          <Route path="/size-result" element={<SizeResult />} />

          {/* Virtual Try-On Room */}
          <Route path="/preview" element={<PreviewRoom />} />

          {/* Other Pages */}
          <Route path="/contact" element={<Contact />} />
          <Route path="/help" element={<Help />} />

          </Routes>
        </Router>
      </ErrorBoundary>
    </AppProvider>
  )
}

export default App
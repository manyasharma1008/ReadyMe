import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import PreviewRoom from "./components/PreviewRoom"

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/preview" element={<PreviewRoom />} />
      </Routes>
    </Router>
  )
}

export default App
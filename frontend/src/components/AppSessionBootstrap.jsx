import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { useApp } from "../context/AppContext"
import { parseActiveProductSessionFromSearch } from "../utils/activeProductSession"
// eifnldew
export default function AppSessionBootstrap() {
  const location = useLocation()
  const { setActiveProduct } = useApp()

  useEffect(() => {
    const session = parseActiveProductSessionFromSearch(location.search)
    if (!session) return

    setActiveProduct(session, { syncPreferences: true })
  }, [location.search, setActiveProduct])

  return null
}

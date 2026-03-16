import { motion } from "framer-motion"
import { useState } from "react"
import Navbar from "../components/Navbar"

export default function Contact() {

  const [form, setForm] = useState({
    name: "",
    email: "",
    message: ""
  })

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    })
  }

  const pageAnimation = {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -40 },
    transition: { duration: 0.5 }
  }

  return (
    <div className="min-h-screen bg-[#e7e3dd] text-charcoal-800 font-sans">

      <Navbar />

      <motion.section
        {...pageAnimation}
        className="px-10 py-24"
      >

        <div className="max-w-6xl mx-auto">

          <h1 className="text-5xl mb-16 tracking-wide">
            Contact
          </h1>

          <div className="grid md:grid-cols-2 gap-16">

            {/* FORM */}
            <form className="flex flex-col gap-6">

              <input
                type="text"
                name="name"
                placeholder="Name"
                onChange={handleChange}
                className="border border-gray-400 px-4 py-3 bg-transparent"
              />

              <input
                type="email"
                name="email"
                placeholder="Email"
                onChange={handleChange}
                className="border border-gray-400 px-4 py-3 bg-transparent"
              />

              <textarea
                rows="5"
                name="message"
                placeholder="Message"
                onChange={handleChange}
                className="border border-gray-400 px-4 py-3 bg-transparent"
              />

              <button className="cta-btn border border-charcoal-800 px-6 py-3 font-mono text-[11px] tracking-widest uppercase">
                <span>Send Message</span>
              </button>

            </form>

            {/* INFO */}
            <div className="flex flex-col gap-10 text-sm">

              <div>
                <h3 className="mb-2 text-lg">Email</h3>
                <p>support@readyme.ai</p>
              </div>

              <div>
                <h3 className="mb-2 text-lg">Location</h3>
                <p>Bangalore, India</p>
              </div>

              <div>
                <h3 className="mb-2 text-lg">Support</h3>
                <p>Mon – Fri / 9AM – 6PM</p>
              </div>

            </div>

          </div>

        </div>

      </motion.section>

    </div>
  )
}
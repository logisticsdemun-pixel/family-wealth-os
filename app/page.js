'use client'
import PasswordGate from './password-gate'
import Dashboard from './dashboard'

export default function Home() {
  return (
    <PasswordGate>
      <Dashboard />
    </PasswordGate>
  )
}
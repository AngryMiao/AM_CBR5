import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App shell', () => {
  it('renders history, settings, logs, and runtime sections without a chatbox home', () => {
    render(<App />)

    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
    expect(screen.getByText('Runtime')).toBeInTheDocument()
    expect(screen.queryByText(/chatbox/i)).toBeNull()
  })
})

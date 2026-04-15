import { render } from '@testing-library/react'
import App from '../App'

describe('desktop frame shell', () => {
  it('wraps the desktop shell in a frame that can expose the shell shadow', () => {
    const { container } = render(<App />)

    const frame = container.querySelector('.desktop-frame')
    const shell = container.querySelector('.desktop-shell')

    expect(frame).toBeInTheDocument()
    expect(shell).toBeInTheDocument()
    expect(frame?.firstElementChild).toBe(shell)
  })
})

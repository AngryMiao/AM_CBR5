import { render, screen } from '@testing-library/react'
import App from '../App'

describe('native titlebar drag region', () => {
  it('marks the empty titlebar area as a tauri drag region', () => {
    render(<App />)

    expect(screen.getByLabelText('窗口拖拽区')).toHaveAttribute('data-tauri-drag-region')
  })
})

import capability from '../../src-tauri/capabilities/default.json'

describe('tauri desktop capability', () => {
  it('grants the window actions required by the custom titlebar', () => {
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        'core:window:allow-close',
        'core:window:allow-is-maximized',
        'core:window:allow-maximize',
        'core:window:allow-minimize',
        'core:window:allow-toggle-maximize',
        'core:window:allow-unmaximize',
      ]),
    )
  })
})

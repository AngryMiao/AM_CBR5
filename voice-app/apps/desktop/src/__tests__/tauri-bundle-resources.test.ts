import tauriConfig from '../../src-tauri/tauri.conf.json'

describe('tauri bundle resources', () => {
  it('bundles the built-in skill bundles into the app resources directory', () => {
    expect(tauriConfig.bundle.resources).toEqual(
      expect.objectContaining({
        '../../../skill-bundles/': 'skill-bundles/',
      }),
    )
  })
})

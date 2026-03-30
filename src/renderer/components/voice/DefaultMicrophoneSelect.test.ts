import { describe, expect, it } from 'vitest'
import {
  getSelectableAudioInputDevices,
  isPseudoAudioInputDeviceId,
  resolveAliasedAudioInputDeviceId,
} from './DefaultMicrophoneSelect'

function createAudioInputDevice(overrides: Partial<MediaDeviceInfo>): MediaDeviceInfo {
  return {
    deviceId: '',
    groupId: '',
    kind: 'audioinput',
    label: '',
    toJSON: () => ({}),
    ...overrides,
  }
}

describe('DefaultMicrophoneSelect helpers', () => {
  it('filters pseudo audio input devices from selectable options', () => {
    const devices = [
      createAudioInputDevice({
        deviceId: 'default',
        label: 'Default - 耳机 (vivo TWS 4 Hands-Free AG Audio) (Bluetooth)',
      }),
      createAudioInputDevice({
        deviceId: 'communications',
        label: 'Communications - 耳机 (vivo TWS 4 Hands-Free AG Audio) (Bluetooth)',
      }),
      createAudioInputDevice({
        deviceId: 'real-device-1',
        label: '耳机 (vivo TWS 4 Hands-Free AG Audio) (Bluetooth)',
      }),
    ]

    expect(getSelectableAudioInputDevices(devices).map((device) => device.deviceId)).toEqual(['real-device-1'])
  })

  it('resolves the pseudo default device id to a concrete device id by label', () => {
    const devices = [
      createAudioInputDevice({
        deviceId: 'default',
        label: 'Default - 耳机 (vivo TWS 4 Hands-Free AG Audio) (Bluetooth)',
      }),
      createAudioInputDevice({
        deviceId: 'real-device-1',
        label: '耳机 (vivo TWS 4 Hands-Free AG Audio) (Bluetooth)',
      }),
    ]

    expect(resolveAliasedAudioInputDeviceId('default', devices)).toBe('real-device-1')
  })

  it('treats default and communications as pseudo device ids', () => {
    expect(isPseudoAudioInputDeviceId('default')).toBe(true)
    expect(isPseudoAudioInputDeviceId('communications')).toBe(true)
    expect(isPseudoAudioInputDeviceId('real-device-1')).toBe(false)
  })
})

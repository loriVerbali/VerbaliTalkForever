/**
 * Keeps tests off the native Mixpanel module. The shared instance in
 * src/utils/mixpanelInstance.ts constructs one Mixpanel at import time, so any test
 * that renders an IEP screen would otherwise reach native code on the first track().
 */
class Mixpanel {
  constructor() {
    this.init = jest.fn().mockResolvedValue(undefined);
    this.identify = jest.fn();
    this.registerSuperProperties = jest.fn();
    this.track = jest.fn();
    this.reset = jest.fn();
    this.clearSuperProperties = jest.fn();
    this.flush = jest.fn();
  }
}

module.exports = { Mixpanel };

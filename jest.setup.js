// jsdom doesn't expose setImmediate; polyfill so test helpers work
if (typeof setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}

beforeEach(() => {
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: jest.fn(),
      },
    },
    declarativeNetRequest: {
      getDynamicRules: jest.fn().mockResolvedValue([]),
      updateDynamicRules: jest.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onInstalled: {
        addListener: jest.fn(),
      },
      getURL: jest.fn((path) => `chrome-extension://fakeid/${path}`),
      openOptionsPage: jest.fn(),
    },
    tabs: {
      query: jest.fn(),
    },
  };
});

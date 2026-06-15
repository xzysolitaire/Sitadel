// jsdom doesn't expose setImmediate; polyfill so test helpers work
if (typeof setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}

beforeEach(() => {
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn().mockResolvedValue({}),
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
      update: jest.fn().mockResolvedValue({}),
      onUpdated: { addListener: jest.fn() },
    },
    windows: {
      create: jest.fn().mockResolvedValue({}),
    },
    scripting: {
      executeScript: jest.fn().mockResolvedValue([{ result: "article" }]),
    },
    history: {
      search: jest.fn().mockResolvedValue([]),
      deleteUrl: jest.fn().mockResolvedValue(undefined),
    },
  };
});

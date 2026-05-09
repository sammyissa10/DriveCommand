require('@testing-library/jest-native/extend-expect');

// Mock expo winter runtime modules to avoid "import outside scope" errors in Jest.
// These modules use dynamic import() for lazy global polyfills that are incompatible
// with Jest's CommonJS environment in Expo SDK 55.
jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: { url: null },
}));

jest.mock('@ungap/structured-clone', () => ({
  default: (obj) => JSON.parse(JSON.stringify(obj)),
}));

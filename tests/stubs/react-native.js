// The platform the pure helpers branch on, set per test (`Platform.OS = 'android'` in jest.isolateModules)
module.exports = { Platform: { OS: 'ios', select: (options) => options.ios ?? options.default } };

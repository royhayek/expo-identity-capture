// No native code under Jest: every hybrid object is missing, as in an app built without it
module.exports = {
  NitroModules: {
    createHybridObject() {
      throw new Error('No native modules under Jest');
    },
  },
};

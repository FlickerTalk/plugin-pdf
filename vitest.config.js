// The plugin runs in a browser frame: its tests need a DOM, and the Ionic the app lends it.
export default { test: { environment: "happy-dom", setupFiles: ["./ionic.setup.js"] } };

// Ambient declarations for third-party libraries that ship no TypeScript types.

/** noVNC — `exports` resolves the package root to the RFB class (default export). */
declare module '@novnc/novnc' {
  const RFB: any
  export default RFB
}

/** Guacamole HTML5 client (renderer): the concatenated `Guacamole` namespace object. */
declare module 'guacamole-common-js' {
  const Guacamole: any
  export default Guacamole
}

/** guacamole-lite (main): the WebSocket-gateway server class (CommonJS default export). */
declare module 'guacamole-lite' {
  const GuacamoleLite: any
  export default GuacamoleLite
}

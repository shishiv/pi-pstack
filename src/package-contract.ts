export const packageContract = {
  name: "@shishiv/pi-pstack",
  piVersionFloor: "0.84.2",
  subagentsVersionFloor: "0.54.0",
  mcpAdapterVersionFloor: "2.27.0",
  upstream: {
    repository: "https://github.com/cursor/plugins",
    path: "pstack",
    version: "0.14.2",
    commit: "46125561306434d8a1d7745d540d8932ab0cd2a2",
  },
} as const;

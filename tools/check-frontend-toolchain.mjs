const nodeVersion = '24.22.1';
const npmVersion = '11.19.1';
if (process.versions.node !== nodeVersion) {
  console.error(`Node.js ${nodeVersion} is required; found ${process.versions.node}. See docs/development.md.`);
  process.exit(1);
}
if (process.env.npm_config_user_agent && !process.env.npm_config_user_agent.startsWith(`npm/${npmVersion} `)) {
  console.error(`npm ${npmVersion} is required. Use the npm bundled with Node.js ${nodeVersion}.`);
  process.exit(1);
}
console.log(`Frontend toolchain: Node.js ${nodeVersion}; npm ${npmVersion} required.`);

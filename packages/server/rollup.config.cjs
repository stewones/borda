const typescript = require('@rollup/plugin-typescript').default;
const generatePackageJson = require('rollup-plugin-generate-package-json');
const json = require('@rollup/plugin-json').default;

module.exports = (config, context) => {
  const filteredPlugins = [];
  for (const plugin of config.plugins) {
    // console.log(JSON.stringify(plugin, null, 3));
    if (
      [
        'peer-deps-external',
        'rollup-plugin-nx-analyzer',
        'commonjs',
        // 'node-resolve'
      ].includes(plugin.name)
    ) {
      filteredPlugins.push(plugin);
    }
  }
  const updatedConfig = {
    // ...config,
    input: config.input,
    output: {
      ...config.output,
      sourcemap: true,
    },
    plugins: [
      ...filteredPlugins,
      json(),
      typescript({
        tsconfig: context.tsConfig,
        compilerOptions: { outDir: config.output.dir, sourceMap: true },
      }),
      generatePackageJson(),
    ],
  };
  return updatedConfig;
};

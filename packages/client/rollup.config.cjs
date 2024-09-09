const typescript = require('@rollup/plugin-typescript').default;
const generatePackageJson = require('rollup-plugin-generate-package-json');
const json = require('@rollup/plugin-json').default;
const path = require('path');

module.exports = (config, context) => {
  const filteredPlugins = config.plugins.filter((plugin) =>
    ['peer-deps-external', 'rollup-plugin-nx-analyzer', 'commonjs'].includes(
      plugin.name
    )
  );

  return {
    ...config,
    // input: config.input,
    output: {
      dir: path.resolve('./dist/packages/client'),
      sourcemap: true,
    },
    // build: {
    //   rollupOptions: {
    //     output: {
    //       dir: path.resolve('./dist/packages/client'),
    //       entryFileNames: 'index.esm.js',
    //       format: 'iife',
    //     },
    //   },
    // },
    plugins: [
      ...filteredPlugins,
      json(),
      typescript({
        tsconfig: context.tsConfig,
        compilerOptions: {
          outDir: config.output.dir,
          sourceMap: true,
          lib: ['es2020', 'dom'],
        },
      }),
      generatePackageJson({
        outputFolder: path.resolve('./dist/packages/client'),
        baseContents: (pkg) => ({
          name: pkg.name,
          version: pkg.version,
          main: path.basename('index.esm.js'),
          types: 'index.d.ts',
        }),
      }),
    ],
  };
};

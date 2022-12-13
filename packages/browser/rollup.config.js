const typescript = require('rollup-plugin-typescript2');
const copy = require('rollup-plugin-copy');
const path = require('path');

module.exports = (config) => {
  config.plugins = config.plugins.filter((it) => it.name !== 'rpt2');

  const newConfig = {
    ...config,
    external: ['@elegante/sdk'],
    plugins: [
      ...config.plugins,
      typescript({
        rootDir: path.join(__dirname, 'src'),
        allowJs: false,
        declaration: true,
        tsconfig: path.join(__dirname, 'tsconfig.json'),
        tsconfigOverride: {
          compilerOptions: {
            paths: {
              '@elegante/sdk': ['dist/packages/sdk'],
            },
          },
        },
      }),
      copy({
        targets: [
          {
            src: 'packages/browser/README.md',
            dest: 'dist/packages/browser',
            hook: 'writeBundle',
            verbose: true,
          },
        ],
      }),
    ],
  };

  return newConfig;
};
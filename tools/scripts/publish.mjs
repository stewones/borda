/**
 * This is a minimal script to publish your package to "npm".
 * This is meant to be used as-is or customize as you see fit.
 *
 * This script is executed on "dist/path/to/library" as "cwd" by default.
 *
 * You might need to authenticate with NPM before running this script.
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import {
  readFileSync,
  writeFileSync,
} from 'fs';

import { readCachedProjectGraph } from '@nrwl/devkit';

function invariant(condition, message) {
  if (!condition) {
    console.error(chalk.bold.red(message));
    process.exit(1);
  }
}

// Executing publish script: node path/to/publish.mjs {name} --v {version} --tag {tag}
// Default "tag" to "next" so we won't publish the "latest" tag by accident.
const [, , name, v, tag = 'next'] = process.argv;

// A simple SemVer validation to validate the version
const validVersion = /^\d+\.\d+\.\d+(-\w+\.\d+)?/;
invariant(
  v && validVersion.test(v),
  `No version provided or version did not match Semantic Versioning, expected: #.#.#-tag.# or #.#.#, got ${v}.`
);

const graph = readCachedProjectGraph();
const project = graph.nodes[name];

invariant(
  project,
  `Could not find project "${name}" in the workspace. Is the project.json configured correctly?`
);

const outputPath = project.data?.targets?.build?.options?.outputPath;
invariant(
  outputPath,
  `Could not find "build.options.outputPath" of project "${name}". Is project.json configured  correctly?`
);

process.chdir(outputPath);

// Updating the version in "package.json" before publishing
try {
  const json = JSON.parse(readFileSync(`package.json`).toString());
  json.version = v;

  if (name === 'browser') {
    json['name'] = `@elegante/${name}`;
    json['type'] = 'module';
    json['dependencies'] = {
      'reflect-metadata': '0.1.13',
    };
  }

  if (name === 'sdk') {
    delete json['type'];
  }

  // write to package.json
  writeFileSync(`package.json`, JSON.stringify(json, null, 2));

  // update original
  const originalPath = ['sdk', 'browser'].includes(name)
    ? `../../../packages/${name}/src/package.json`
    : `../../../packages/${name}/package.json`;
  const original = JSON.parse(readFileSync(originalPath).toString());
  original.version = v;
  writeFileSync(originalPath, JSON.stringify(json, null, 2));

  // update @elegante/server/sdk/src/package.json
  if (name === 'server') {
    const sdkPath = `../../../dist/packages/server/sdk/src/package.json`;
    const sdkJson = JSON.parse(readFileSync(sdkPath).toString());
    sdkJson.main = `./index.js`; // not sure why but the build is writing this as index.cjs which doesn't exist inside the package
    writeFileSync(sdkPath, JSON.stringify(sdkJson, null, 2));
  }
} catch (e) {
  console.error(
    chalk.bold.red(`Error reading package.json file from library build output.`)
  );
}

// Execute "npm publish" to publish
execSync(`npm publish --access public --tag ${tag}`);

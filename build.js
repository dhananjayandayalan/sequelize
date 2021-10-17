'use strict';

const glob = require('fast-glob');
const { promisify } = require('util');
const { build } = require('esbuild');
const fs = require('fs');
const copyFiles = require('copyfiles');
const path = require('path');
const { exec } = require('child_process');

// if this script is moved, this will need to be adjusted
const rootDir = __dirname;
const outdir = path.join(rootDir, 'dist');

const nodeMajorVersion = Number(process.version.match(/(?<=^v)\d+/));

async function rmBuildDir() {
  try {
    await promisify(fs.stat)(outdir);
    if (nodeMajorVersion >= 12) {
      await promisify(fs.rmdir)(outdir, { recursive: true });
    } else {
      await promisify(fs.rmdir)(outdir);
    }
  } catch {
    /* no-op */
  }
}

async function main() {
  console.log('Compiling sequelize...');
  const [declarationFiles, filesToCompile] = await Promise.all([
    // Find all .d.ts files from types/
    glob('./types/**/*.d.ts', { onlyFiles: true, absolute: false }),
    // Find all .js and .ts files from lib/
    glob('./lib/**/*.[tj]s', { onlyFiles: true, absolute: false }),
    // Delete dist/ for a full rebuild.
    rmBuildDir()
  ]);

  // copy .d.ts files prior to generating them from the .ts files
  // so the .ts files in lib/ will take priority..
  await promisify(copyFiles)(
    // The last path in the list is the output directory
    declarationFiles.concat(outdir),
    { up: 1 }
  );

  await Promise.all([
    build({
      // Adds source mapping
      sourcemap: true,
      // The compiled code should be usable in node v10
      target: 'node10',
      // The source code's format is commonjs.
      format: 'cjs',

      outdir,
      entryPoints: filesToCompile
        .concat('./index.js')
        .map(file => path.resolve(file)),

      // minify the compiled code
      minify: true,
      // Keep `constructor.name` the same (used for associations)
      keepNames: true
    }),

    promisify(exec)('tsc', {
      env: {
        // binaries installed from modules have symlinks in
        // <pkg root>/node_modules/.bin.
        PATH: `${process.env.PATH || ''}:${path.join(
          rootDir,
          'node_modules/.bin'
        )}`
      },
      cwd: rootDir
    })
  ]);
}

main().catch(console.error).finally(process.exit);

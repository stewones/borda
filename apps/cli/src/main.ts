import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import color from 'picocolors';

import { setTimeout } from 'node:timers/promises';

import * as p from '@clack/prompts';

import { environment } from './env';

async function main() {
  console.clear();

  await setTimeout(1000);

  p.intro(`${color.bgCyan(color.black('Create Elegante Server 🤵‍♂️'))}`);

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: 'Enter your project name',
          placeholder: 'my-elegante-app',
          defaultValue: 'my-elegante-app',
        }),
      pathname: ({ results }) =>
        p.text({
          message: 'Where should we create your project?',
          placeholder: `./${results.name}`,
          initialValue: `./${results.name}`,
          validate: (value) => {
            if (!value) return 'Please enter a path.';
            if (value[0] !== '.') return 'Please enter a relative path.';
          },
        }),
      starter: () =>
        p.select({
          message: `Pick a starter type`,
          initialValue: 'ts-server',
          options: [
            {
              value: 'ts-server',
              label: 'A standalone TypeScript server',
            },
            { value: 'nx-angular', label: 'NX Workspace with an Angular app' },
          ],
        }),
      install: () =>
        p.confirm({
          message: 'Install dependencies?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled.');
        process.exit(0);
      },
    }
  );

  /**
   * Check if dir already exists, ideally it should have been checked by the prompt validation
   * but it looks like Clack doesn't support async validation yet.
   */
  if (await dirExists(project.pathname as string)) {
    p.cancel(`Directory ${project.pathname} already exists. Please try again.`);
    process.exit(0);
  }

  const s = p.spinner();
  const hasPnpm = await hasPnpmInstalled();
  const manager: 'npm' | 'pnpm' = `${hasPnpm ? 'pnpm' : 'npm'}`;

  /**
   * Create dir
   */
  s.start(`Creating directory`);
  await createDir(project.pathname as string);
  copyFiles(project.starter, project.pathname as string);
  s.stop(`Directory created`);

  /**
   * Install project
   */
  if (project.install) {
    s.start(`Installing via ${manager}`);
    await install(manager, project.pathname as string);
    s.stop(`Installed via ${manager}`);
  }

  /**
   * Finish up
   */
  const nextSteps = `cd ${project.pathname}        \n${
    project.install ? '' : `${manager} install\n`
  }${manager} dev`;

  p.note(nextSteps, 'Next steps.');

  p.outro(
    `Problems? ${color.underline(
      color.cyan('https://github.com/stewones/elegante/issues')
    )}`
  );
}

main().catch(console.error);

function hasPnpmInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    exec('pnpm --version', (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function install(manager: 'npm' | 'pnpm', pathname: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    exec(`cd ${pathname} && ${manager} install`, (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function createDir(pathname: string) {
  return new Promise((resolve, reject) => {
    fs.mkdir(pathname, { recursive: true }, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(true);
    });
  });
}

function dirExists(pathname: string) {
  return new Promise((resolve) => {
    fs.access(pathname, fs.constants.F_OK, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// copy files from starter to destination
function copyFiles(starter: 'ts-server' | 'nx-angular', pathname: string) {
  const srcDir = path.join(
    environment.production ? __dirname : __dirname.replace('/dist', '/'),
    `src/starters/${starter}`
  );
  const destDir = path.join(process.cwd(), pathname);

  return fs.copy(srcDir, destDir, { recursive: true });
}

// @todo initial implementation for compiling files with data. needs more work.
// function compileFile(
//   srcDir: string,
//   destDir: string,
//   file: string,
//   data: Data
// ): Promise<void> {
//   return new Promise((resolve, reject) => {
//     fs.readFile(path.join(srcDir, file), 'utf8', (err, content) => {
//       if (err) {
//         reject(err);
//         return;
//       }

//       const compiled = ejs.render(content, data);

//       fs.writeFile(path.join(destDir, file), compiled, (err) => {
//         if (err) {
//           reject(err);
//           return;
//         }

//         resolve();
//       });
//     });
//   });
// }

// function compileFiles(
//   starter: 'ts-server' | 'nx-angular',
//   srcPathname = '',
//   destPathname: string,
//   data: Data = {}
// ): Promise<void> {
//   return new Promise((resolve, reject) => {
//     const srcDir = path.join(
//       environment.production ? __dirname : __dirname.replace('/dist', '/'),
//       `src/starters/${starter}${srcPathname}`
//     );
//     const destDir = path.join(process.cwd(), destPathname);

//     // Read the source directory
//     fs.readdir(srcDir, async (err, files) => {
//       if (err) {
//         reject(err);
//         return;
//       }

//       try {
//         // Compile each file in parallel
//         // Account to subdirectories
//         await Promise.all(
//           files.map(async (fileOrDir) => {
//             const stat = await fs.promises.stat(path.join(srcDir, fileOrDir));
//             console.log(`${destPathname}/${fileOrDir}`, `/${fileOrDir}`);

//             if (stat.isDirectory()) {
//               await createDir(path.join(destDir, fileOrDir));
//               await compileFiles(
//                 starter,
//                 `/${fileOrDir}`,
//                 `${path.join(destDir, fileOrDir)}/${fileOrDir}`,
//                 data
//               );
//             } else {
//               await compileFile(srcDir, destDir, fileOrDir, data);
//             }
//           })
//         );

//         resolve();
//       } catch (err) {
//         reject(err);
//       }
//     });
//   });
// }

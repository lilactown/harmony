#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as tsickle from "tsickle";

let projectDir = "./";

function loadConfig() {
  let configFile = ts.findConfigFile(projectDir, fs.existsSync);

  if (configFile) {
    let { config, error: readError } = ts.readConfigFile(configFile, (path) =>
      fs.readFileSync(path, "utf-8")
    );

    if (readError) {
      throw new Error("An error occurred");
    }

    return ts.parseJsonConfigFileContent(config, ts.sys, projectDir);
  }
}

function toClosureJS(
  options: ts.CompilerOptions,
  fileNames: string[],
  writeFile: ts.WriteFileCallback
): tsickle.EmitResult {
  let absoluteFileNames = fileNames.map((i) => path.resolve(i));

  let compilerHost = ts.createCompilerHost(options);
  let program = ts.createProgram(absoluteFileNames, options, compilerHost);

  let filesToProcess = new Set(absoluteFileNames);
  let rootModulePath = projectDir;

  let transformerHost: tsickle.TsickleHost = {
    shouldSkipTsickleProcessing: (fileName: string) => {
      return !filesToProcess.has(path.resolve(fileName));
    },
    // hardcode ignore warnings to false for now
    shouldIgnoreWarningsForPath: (fileName: string) => false,
    pathToModuleName: (context, fileName) =>
      tsickle.pathToModuleName(rootModulePath, context, fileName),
    fileNameToModuleId: (fileName) => path.relative(rootModulePath, fileName),
    es5Mode: true,
    googmodule: true,
    transformDecorators: true,
    transformTypesToClosure: true,
    typeBlackListPaths: new Set(),
    untyped: false,
    logWarning: (warning) =>
      console.error(ts.formatDiagnostics([warning], compilerHost)),
    options,
    moduleResolutionHost: compilerHost,
  };

  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      modulesManifest: new tsickle.ModulesManifest(),
      externs: {},
      emitSkipped: true,
      emittedFiles: [],
    };
  }
  return tsickle.emit(program, transformerHost, writeFile);
}

function main(): number {
  const config = loadConfig();
  if (config.errors.length) {
    console.error(
      ts.formatDiagnostics(config.errors, ts.createCompilerHost(config.options))
    );
    return 1;
  }

  if (config.options.module !== ts.ModuleKind.CommonJS) {
    // This is not an upstream TypeScript diagnostic, therefore it does not go
    // through the diagnostics array mechanism.
    console.error(
      "tsickle converts TypeScript modules to Closure modules via CommonJS internally. " +
        'Set tsconfig.js "module": "commonjs"'
    );
    return 1;
  }

  // outDir needs to be an absolute path for tsickle
  config.options.outDir = path.resolve(config.options.outDir);

  // Run tsickle+TSC to convert inputs to Closure JS files.
  const result = toClosureJS(
    config.options,
    config.fileNames,
    (filePath: string, contents: string) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents, { encoding: "utf-8" });
    }
  );
  if (result.diagnostics.length) {
    console.error(
      ts.formatDiagnostics(
        result.diagnostics,
        ts.createCompilerHost(config.options)
      )
    );
    return 1;
  }

  return 0;
}

process.exit(main());

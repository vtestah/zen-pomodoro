'use strict';

// GJS-aware ESLint config for the Cinnamon applet (run: `npm run lint`).
// The applet runs under Cinnamon's gjs, so host globals like `imports` and
// `global` are provided at runtime. Rules stay light and mostly non-blocking:
// this is a helper for catching real mistakes (dup keys/args, unreachable code,
// accidental assignment in conditions), not a style gate. Tighten over time.

const gjsGlobals = {
    imports: 'readonly',
    global: 'readonly',
    globalThis: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    window: 'readonly',
    ARGV: 'readonly',
    pkg: 'readonly',
};

module.exports = [
    {
        files: ['6.4/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...gjsGlobals,
                require: 'readonly',
                module: 'writable',
                exports: 'writable',
            },
        },
        rules: {
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-func-assign': 'error',
            'no-cond-assign': ['error', 'always'],
            'no-unreachable': 'warn',
            'no-redeclare': 'warn',
            'no-undef': 'warn',
            'no-unused-vars': 'off',
        },
    },
    {
        files: ['tests/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'writable',
                __dirname: 'readonly',
                console: 'readonly',
                process: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
];

import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
export default [{ ignores: ['node_modules/**','dist/**'] }, { files: ['**/*.ts','**/*.tsx'], languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } }, plugins: { '@typescript-eslint': ts }, rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } }];

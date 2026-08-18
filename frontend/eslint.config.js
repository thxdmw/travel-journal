import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  /*
   * playwright-report 和 test-results 是跑 E2E 生成的产物，里面是 Playwright 自己打包过的
   * 第三方 JS。漏掉它们的话，只要跑过一次 --trace on，下一次 lint 就会报出几千条来自压缩
   * 代码的错误，把真正的问题淹掉。
   */
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'e2e/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      // 类型安全硬约束：any 与 ts-ignore 一律报错
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // 构建脚本的 console 就是它的输出，不是调试残留
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  prettier,
)

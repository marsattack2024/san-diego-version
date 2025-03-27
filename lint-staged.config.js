// lint-staged.config.js
module.exports = {
  // Type check TypeScript files
  '**/*.ts?(x)': () => 'npx tsc --noEmit',
  
  // Lint & Prettify TS and JS files
  '**/*.(ts|tsx|js)': filenames => [
    `npx eslint ${filenames.join(' ')}`,
  ],
};

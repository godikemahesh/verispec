export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'bin/**/*.js'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
];

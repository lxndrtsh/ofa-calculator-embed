import path from 'node:path';
import { fileURLToPath } from 'node:url';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('rollup').RollupOptions} */
export default {
  input: path.join(__dirname, 'src/index.ts'),
  output: {
    file: path.join(__dirname, '../../public/cdn/leadcalc-community.min.js'),
    format: 'umd',
    name: 'HPPEmbed',
    sourcemap: true
  },
  plugins: [
    typescript({
      tsconfig: path.join(__dirname, '../../tsconfig.json'),
      declaration: false,
      declarationMap: false
    }),
    terser()
  ]
};

import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from 'rollup-plugin-node-resolve'

export default {
  input: 'src/index.js',
  plugins: [
    babel(),
    nodeResolve({
      jsnext: true,
      main: true
    }),
    commonjs()
  ],
  output: [
    { file: './dist/rar-es.js', format: 'es' },
    { file: './dist/rar-umd.js', format: 'umd', name: 'rar' },
    { file: './docs/rar-umd.js', format: 'umd', name: 'rar' }
  ]
}

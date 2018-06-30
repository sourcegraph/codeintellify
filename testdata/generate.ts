import * as fs from 'fs-extra'
import * as path from 'path'

import { generateGithubCodeTable } from './github/generate'
import { generateSourcegraphCodeTable } from './sourcegraph/generate'

const generatedDir = path.join(__dirname, 'generated')

fs.emptyDirSync(generatedDir)
fs.mkdirpSync(generatedDir)

const code = fs
    .readFileSync(path.join(__dirname, 'mux.go.txt'))
    .toString()
    .split('\n')

fs.writeFileSync(path.join(generatedDir, 'github.html'), generateGithubCodeTable(code))
fs.writeFileSync(path.join(generatedDir, 'sourcegraph.html'), generateSourcegraphCodeTable(code))
